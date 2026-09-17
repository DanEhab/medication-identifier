// Tests the clinical answer path of api/generate.js against a real mongod.
//
//   npm test
//
// The patient answer has had a schema and a normaliser for a while; this one
// had neither, and its fields could arrive as strings, arrays or nested
// objects. What is under test is that whatever the model returns, the screen
// gets flat strings — and that an entry cached in the old shape is refetched
// rather than served as a page of empty rows.

const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');

const DB_NAME = 'medication_identifier';
const COLLECTION = 'professional_medications';

let mongod;
let client;
let handler;
let geminiCalls = 0;
let geminiPayload = null;

/** The prompt shape fetchProfessionalDrugInformation sends. */
const professionalPrompt = (drug) =>
  `Provide detailed technical information for the drug: ${drug}, intended for a healthcare professional. ` +
  'Give the generic name and ATC code, the pharmacological class, the mechanism of action. ' +
  'Return ONLY the JSON object, no additional text.';

function installGeminiStub(payload) {
  geminiPayload = payload;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      geminiCalls++;
      return {
        candidates: [{ content: { parts: [{ text: JSON.stringify(geminiPayload) }] } }],
      };
    },
  });
}

function invoke(body) {
  const req = { method: 'POST', headers: {}, body };
  let statusCode = 200;
  return new Promise((resolve) => {
    const res = {
      setHeader() {},
      status(code) { statusCode = code; return res; },
      json(payload) { resolve({ statusCode, payload }); return res; },
      end() { resolve({ statusCode, payload: undefined }); return res; },
    };
    handler(req, res);
  });
}

const VALID = {
  genericName: 'Atorvastatin',
  atcCode: 'C10AA05',
  formAndStrength: 'calcium trihydrate · 20 mg f/c tab',
  drugClass: 'HMG-CoA reductase inhibitor (statin)',
  indications: 'Primary hypercholesterolaemia and mixed dyslipidaemia; secondary prevention of cardiovascular events.',
  mechanism: 'Competitively inhibits HMG-CoA reductase, the rate-limiting step of hepatic cholesterol synthesis.',
  pharmacokinetics: {
    absorption: 'Rapidly absorbed; oral bioavailability ~14% after extensive first-pass extraction.',
    distribution: 'Highly protein-bound (>98%); volume of distribution 381 L.',
    metabolism: 'Hepatic, via CYP3A4, to active ortho- and para-hydroxylated metabolites.',
    excretion: 'Biliary, after hepatic and extrahepatic metabolism; renal clearance is negligible.',
    halfLife: '14 h (active metabolites 20-30 h)',
  },
  contraindications: ['Active hepatic disease', 'Pregnancy and lactation'],
  majorInteractions: ['Strong CYP3A4 inhibitors', 'Ciclosporin', 'Gemfibrozil'],
  interactions: [
    { group: 'Increased exposure', detail: 'Strong CYP3A4 inhibitors raise plasma levels; cap the dose.' },
  ],
  adverseEffects: [
    { system: 'Musculoskeletal', effects: ['Myalgia', 'Rhabdomyolysis (rare)'] },
    { system: 'Hepatic', effects: ['Transaminase rise'] },
  ],
  monitoring: 'Lipid panel at 4-12 weeks after initiation or dose change.',
  chemistry: 'Calcium trihydrate salt; C33H34FN2O5 · ½Ca.',
  bcsClass: 'II (low solubility, high permeability)',
  references: ['SmPC', 'DailyMed', 'BNF'],
};

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.GEMINI_API_KEY = 'test-key';
  client = await MongoClient.connect(mongod.getUri());
  installGeminiStub(VALID);
  handler = require('./generate.js');
});

test.after(async () => {
  await require('./db.js').closeDatabase();
  await client?.close();
  await mongod?.stop();
});

test.beforeEach(async () => {
  geminiCalls = 0;
  installGeminiStub(VALID);
  const db = client.db(DB_NAME);
  await db.collection(COLLECTION).deleteMany({});
  await db.collection('medication_aliases').deleteMany({});
  await db.collection('rate_limits').deleteMany({});
});

test('a clinical answer is normalised before anybody sees it', async () => {
  const res = await invoke({ contents: professionalPrompt('Atorvastatin') });

  assert.equal(res.statusCode, 200);
  const info = JSON.parse(res.payload.text);
  assert.equal(info.drugClass, 'HMG-CoA reductase inhibitor (statin)');
  assert.deepEqual(info.majorInteractions, ['Strong CYP3A4 inhibitors', 'Ciclosporin', 'Gemfibrozil']);
});

/*
  ADME arrives as its four parts and stays that way.

  This used to assert the opposite — that the object was flattened into one
  string — which was right while the screen had one paragraph to put it in. The
  screen renders the parts under their own subheadings now, so flattening them
  is what would break it.
*/
test('the four parts of ADME are kept apart', async () => {
  installGeminiStub({
    ...VALID,
    genericName: 'Nested',
    pharmacokinetics: {
      absorption: 'Rapid, peak at 1-2 h.',
      metabolism: 'CYP3A4.',
      excretion: 'Biliary.',
    },
  });
  const res = await invoke({ contents: professionalPrompt('Nested') });
  const info = JSON.parse(res.payload.text);

  assert.equal(typeof info.pharmacokinetics, 'object');
  assert.equal(info.pharmacokinetics.absorption, 'Rapid, peak at 1-2 h.');
  assert.equal(info.pharmacokinetics.metabolism, 'CYP3A4.');
  assert.equal(info.pharmacokinetics.excretion, 'Biliary.');
  // Asked for but not answered: present and empty, never undefined, because
  // the screen reads every part.
  assert.equal(info.pharmacokinetics.distribution, '');
  assert.equal(info.pharmacokinetics.halfLife, '');
});

test('a model that answers ADME as one paragraph is still readable', async () => {
  // Better under the wrong subheading than thrown away.
  installGeminiStub({
    ...VALID,
    genericName: 'Flat',
    pharmacokinetics: 'Bioavailability 40-80%, half-life 6-7 days, renal excretion.',
  });
  const res = await invoke({ contents: professionalPrompt('Flat') });
  const info = JSON.parse(res.payload.text);

  assert.match(info.pharmacokinetics.absorption, /Bioavailability 40-80%/);
});

/*
  The grouped sections keep their groups.

  Adverse effects by organ system and interactions by mechanism are the reason
  those sections can be read at all; flattening them gives one undifferentiated
  list of forty phrases.
*/
test('adverse effects keep the system they belong to', async () => {
  installGeminiStub({
    ...VALID,
    genericName: 'Grouped',
    adverseEffects: [
      { system: 'Cardiovascular', effects: ['Palpitations', 'Tachycardia'] },
      { system: 'CNS', effects: ['Tremor'] },
    ],
  });
  const res = await invoke({ contents: professionalPrompt('Grouped') });
  const info = JSON.parse(res.payload.text);

  assert.deepEqual(info.adverseEffects, [
    { heading: 'Cardiovascular', items: ['Palpitations', 'Tachycardia'] },
    { heading: 'CNS', items: ['Tremor'] },
  ]);
});

test('a heading hiding inside a string is recovered', async () => {
  // What comes back when the model flattens its own list before answering.
  installGeminiStub({
    ...VALID,
    genericName: 'Strings',
    adverseEffects: ['Cardiovascular: palpitations', 'CNS: tremor'],
  });
  const res = await invoke({ contents: professionalPrompt('Strings') });
  const info = JSON.parse(res.payload.text);

  assert.deepEqual(info.adverseEffects.map((g) => g.heading), ['Cardiovascular', 'CNS']);
});

test('an object keyed by system is read as groups too', async () => {
  installGeminiStub({
    ...VALID,
    genericName: 'Keyed',
    adverseEffects: { Gastrointestinal: ['Diarrhoea'], Dermatologic: ['Rash'] },
  });
  const res = await invoke({ contents: professionalPrompt('Keyed') });
  const info = JSON.parse(res.payload.text);

  assert.deepEqual(info.adverseEffects, [
    { heading: 'Gastrointestinal', items: ['Diarrhoea'] },
    { heading: 'Dermatologic', items: ['Rash'] },
  ]);
});

test('interactions keep the mechanism they are grouped under', async () => {
  installGeminiStub({
    ...VALID,
    genericName: 'Interacting',
    interactions: [
      { group: 'Decreased absorption', detail: 'Separate by four hours.' },
    ],
  });
  const res = await invoke({ contents: professionalPrompt('Interacting') });
  const info = JSON.parse(res.payload.text);

  assert.deepEqual(info.interactions, [
    { heading: 'Decreased absorption', items: ['Separate by four hours.'] },
  ]);
});

test('interactions given as one string still arrive as a list', async () => {
  installGeminiStub({ ...VALID, genericName: 'Stringy', majorInteractions: 'Ciclosporin' });
  const res = await invoke({ contents: professionalPrompt('Stringy') });
  const info = JSON.parse(res.payload.text);
  assert.deepEqual(info.majorInteractions, ['Ciclosporin']);
});

test('the keys the model substitutes are mapped onto the ones the screen reads', async () => {
  installGeminiStub({
    generic_name: 'Aliased',
    atc_code: 'A01AA01',
    drug_class: 'Test class that is comfortably long enough to count',
    mechanism_of_action: 'A mechanism sentence that is comfortably long enough to count.',
    adme: 'Kinetics text that is comfortably long enough to count as substantive.',
    contraindication: 'None.',
    drug_interactions: ['Warfarin'],
    monitoring_parameters: 'INR.',
  });
  const res = await invoke({ contents: professionalPrompt('Aliased') });
  const info = JSON.parse(res.payload.text);

  assert.equal(info.genericName, 'Aliased');
  assert.equal(info.atcCode, 'A01AA01');
  assert.match(info.mechanism, /A mechanism sentence/);
  assert.deepEqual(info.majorInteractions, ['Warfarin']);
});

test('a second lookup is served from the cache without calling Gemini', async () => {
  await invoke({ contents: professionalPrompt('Atorvastatin') });
  geminiCalls = 0;

  const res = await invoke({ contents: professionalPrompt('Atorvastatin') });
  assert.equal(res.payload.cached, true);
  assert.equal(geminiCalls, 0);
  assert.equal(JSON.parse(res.payload.text).drugClass, VALID.drugClass);
});

test('an entry cached in the old shape is refetched rather than served', async () => {
  // Exactly what is in production today: the keys the previous prompt asked
  // for, none of which the redesigned screen reads.
  await client.db(DB_NAME).collection(COLLECTION).insertOne({
    _id: 'oldshape',
    canonicalKey: 'oldshape',
    language: 'en',
    data: {
      chemistry: 'C33H35FN2O5',
      bcsClass: 'II',
      pharmacology: 'A statin.',
      mechanismOfAction: 'Inhibits HMG-CoA reductase.',
      adverseEffects: 'Myalgia.',
      references: ['BNF'],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  geminiCalls = 0;
  const res = await invoke({ contents: professionalPrompt('OldShape') });

  assert.equal(res.payload.cached, false, 'it must not be served as it stands');
  assert.equal(geminiCalls, 1, 'it is fetched again');

  const rewritten = await client.db(DB_NAME).collection(COLLECTION).findOne({ _id: 'oldshape' });
  assert.ok(rewritten.data.drugClass, 'and rewritten in the shape the screen reads');
});

test('an answer too thin to be a clinical summary is served but not cached', async () => {
  installGeminiStub({ genericName: 'Thin', atcCode: '', drugClass: '', mechanism: '' });
  const res = await invoke({ contents: professionalPrompt('Thin') });

  assert.equal(res.statusCode, 200, 'the caller still gets what there is');
  const stored = await client.db(DB_NAME).collection(COLLECTION).findOne({ _id: 'thin' });
  assert.equal(stored, null, 'an empty page of headings must not be cached');
});

test('a patient lookup is unaffected by any of this', async () => {
  installGeminiStub({
    drugName: 'Aspirin', canonicalName: 'aspirin', brandName: 'Aspirin', strength: '75mg',
    whatItIsFor: 'Thins the blood to lower clot risk.', commonUse: 'Clot prevention.',
    howToTake: 'Swallow with water.', dosageAdministration: 'One a day.',
    foodDrinkEffect: 'With food.', missedDose: 'Skip it.', tellYourDoctorIf: 'you bruise easily.',
    neverWith: 'Ibuprofen', quickDose: '1 tablet', quickDoseNote: 'a day',
    quickTiming: 'Morning', quickTimingNote: 'same hour', quickFood: 'Food', quickFoodNote: 'with meals',
    commonSideEffects: ['Indigestion'], seriousSideEffects: ['Bleeding'],
    consultDoctorWhen: ['Black stools'], storage: 'Dry place.', recognition: 'medication',
  });

  const res = await invoke({
    contents: 'Provide patient-friendly information for the drug: Aspirin. Return ONLY the JSON object.',
  });
  const info = JSON.parse(res.payload.text);
  assert.equal(info.whatItIsFor, 'Thins the blood to lower clot risk.');
});

/*
  ── The two interaction fields are told apart by shape ────────────────────

  The model answers "drugInteractions" with whichever of them it produced. A
  flat list is the row of labels a clinician scans; a list of objects is the
  grouped detail that says what to do. Deciding from the name alone put a
  grouped answer into the chips as "Group: detail" strings.
*/
test('a flat list under drugInteractions becomes the labels', async () => {
  const { majorInteractions, interactions, ...rest } = VALID;
  installGeminiStub({ ...rest, genericName: 'FlatLinks', drugInteractions: ['Warfarin', 'Ciclosporin'] });
  const info = JSON.parse((await invoke({ contents: professionalPrompt('Flat') })).payload.text);

  assert.deepEqual(info.majorInteractions, ['Warfarin', 'Ciclosporin']);
  assert.deepEqual(info.interactions, []);
});

test('a grouped list under the same name becomes the detail', async () => {
  const { majorInteractions, interactions, ...rest } = VALID;
  installGeminiStub({
    ...rest,
    genericName: 'Structured',
    drugInteractions: [{ group: 'Enzyme induction', detail: 'Clears faster.' }],
  });
  const info = JSON.parse((await invoke({ contents: professionalPrompt('Structured') })).payload.text);

  assert.deepEqual(info.interactions, [{ heading: 'Enzyme induction', items: ['Clears faster.'] }]);
  // And not also as chips, or the same interactions appear twice.
  assert.deepEqual(info.majorInteractions, []);
});

/*
  An entry written against the flat schema is refused rather than served.

  Its pharmacokinetics is a string and it has no grouped adverse effects, so
  the screen would render four empty subheadings and two empty sections. It is
  fetched again instead, which is how the old rows are replaced without anybody
  having to go and find them.
*/
test('an entry from the old flat schema is treated as stale', async () => {
  const db = client.db(DB_NAME);
  await db.collection('professional_medications').deleteMany({});
  await db.collection('professional_medications').insertOne({
    _id: 'oldshape',
    canonicalKey: 'oldshape',
    language: 'en',
    data: {
      genericName: 'OldShape',
      atcCode: 'A01AA01',
      formAndStrength: '10 mg tab',
      drugClass: 'A class long enough to count as substantive.',
      mechanism: 'A mechanism long enough to count as substantive.',
      pharmacokinetics: 'One paragraph of kinetics, as the old schema asked for.',
      contraindications: 'None.',
      majorInteractions: ['Warfarin'],
      monitoring: 'Nothing routine.',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  installGeminiStub(VALID);
  geminiCalls = 0;
  const res = await invoke({ contents: professionalPrompt('OldShape') });

  assert.equal(res.payload.cached, false, 'the flat entry must not be served');
  assert.equal(geminiCalls, 1, 'it is fetched again instead');

  const rewritten = await db.collection('professional_medications').findOne({ _id: 'oldshape' });
  assert.equal(typeof rewritten.data.pharmacokinetics, 'object',
    'and replaced with one the screen can render');
});
