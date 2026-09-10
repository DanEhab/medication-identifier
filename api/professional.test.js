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
  mechanism: 'Competitively inhibits HMG-CoA reductase, the rate-limiting step of hepatic cholesterol synthesis.',
  pharmacokinetics: 'Oral bioavailability ~14%. Extensive first-pass metabolism via CYP3A4. Half-life 14 h.',
  contraindications: 'Active hepatic disease, pregnancy and lactation.',
  majorInteractions: ['Strong CYP3A4 inhibitors', 'Ciclosporin', 'Gemfibrozil'],
  monitoring: 'Lipid panel at 4-12 weeks after initiation or dose change.',
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

test('a nested pharmacokinetics object becomes readable text', async () => {
  // The commonest real shape: ADME as an object rather than a sentence. This
  // used to reach the screen as an object and React refused to render it.
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

  assert.equal(typeof info.pharmacokinetics, 'string');
  assert.match(info.pharmacokinetics, /Absorption: Rapid/);
  assert.match(info.pharmacokinetics, /Metabolism: CYP3A4/);
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
