// Tests the MongoDB caching behaviour of api/generate.js against a real mongod.
//
//   npm test
//
// Gemini is stubbed so the tests never call the real API; what is under test is
// which requests reach Gemini at all, and which are served from the cache.

const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');

const DB_NAME = 'medication_identifier';

let mongod;
let client;
let handler;
let geminiCalls = 0;
let resolveCalls = 0;

/** Minimal stand-in for the req/res pair Vercel provides. */
function invoke(body) {
  const req = { method: 'POST', headers: {}, body };
  let statusCode = 200;
  return new Promise((resolve) => {
    const res = {
      setHeader() {},
      status(code) {
        statusCode = code;
        return res;
      },
      json(payload) {
        resolve({ statusCode, payload });
        return res;
      },
      end() {
        resolve({ statusCode, payload: undefined });
        return res;
      },
    };
    handler(req, res);
  });
}

/** A complete, well-formed answer — the shape the UI actually needs. */
const VALID_ANSWER = {
  drugName: 'Stub Drug',
  canonicalName: 'stub drug',
  strength: '1mg',
  commonUse: 'Used for testing.',
  dosageAdministration: 'One tablet daily.',
  foodDrinkEffect: 'Take with food.',
  missedDose: 'Take when remembered.',
  commonSideEffects: ['Nausea', 'Headache'],
  seriousSideEffects: ['Rash'],
  consultDoctorWhen: ['Symptoms persist'],
  storage: 'Store below 25C.',
};

/**
 * What a real model does: several brand names and misspellings of one medicine
 * all resolve to the same generic ingredient. This is the behaviour the cache
 * key now depends on, so the stub has to reproduce it.
 */
const PHARMACY = {
  panadol: { drugName: 'Paracetamol (Panadol)', canonicalName: 'paracetamol' },
  panadooll: { drugName: 'Paracetamol (Panadol)', canonicalName: 'paracetamol' },
  panadl: { drugName: 'Paracetamol (Panadol)', canonicalName: 'paracetamol' },
  paracetamol: { drugName: 'Paracetamol', canonicalName: 'paracetamol' },
  acetaminophen: { drugName: 'Paracetamol (Acetaminophen)', canonicalName: 'paracetamol' },
  بنادول: { drugName: 'Paracetamol (Panadol)', canonicalName: 'paracetamol' },
  brufen: { drugName: 'Ibuprofen (Brufen)', canonicalName: 'ibuprofen' },
  ibuprofin: { drugName: 'Ibuprofen', canonicalName: 'ibuprofen' },
  ibuprofen: { drugName: 'Ibuprofen', canonicalName: 'ibuprofen' },
};

/** Pulls the requested drug out of the prompt, the way the handler does. */
function requestedDrug(body) {
  const text =
    typeof body?.contents === 'string'
      ? body.contents
      : JSON.stringify(body?.contents ?? '');
  const match = text.match(/(?:drug|medication):\s*([^.,"]+)/i);
  return match ? match[1].trim() : '';
}

/**
 * The default answer describes whatever was asked for, resolving known brands
 * and typos to their ingredient. Anything unknown echoes the search term, so a
 * test that looks up "Aspirin" gets an entry keyed "aspirin".
 */
function defaultAnswerFor(drug) {
  const key = String(drug).toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();
  const known = PHARMACY[key] || PHARMACY[key.split(' ')[0]];
  if (known) return { ...VALID_ANSWER, ...known, recognition: 'medication' };
  return {
    ...VALID_ANSWER,
    drugName: drug || 'Stub Drug',
    canonicalName: key || 'stub drug',
    recognition: 'medication',
  };
}

/**
 * Counts Gemini calls without making any. Pass a fixed payload to force one
 * answer, or nothing to get an answer about the drug that was requested.
 */
function installGeminiStub(payload) {
  global.fetch = async (_url, init) => {
    let body = null;
    try {
      body = JSON.parse(init.body);
    } catch {
      body = null;
    }
    const promptText = JSON.stringify(body?.contents ?? '');

    const reply = (value) => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
      }),
    });

    // The cheap resolution step. Counted separately because the whole point of
    // it is that it costs a fraction of a full answer, so a test that says
    // "one Gemini call" must not be satisfied by a resolution.
    if (promptText.includes('generic active ingredient')) {
      resolveCalls++;
      const drug = requestedDrug({ contents: promptText.replace(/.*medicine:/, 'drug:') });
      return reply({ canonicalName: defaultAnswerFor(drug).canonicalName });
    }

    geminiCalls++;
    const answer =
      payload !== undefined ? payload : defaultAnswerFor(requestedDrug({ contents: promptText }));
    return reply(answer);
  };
}

const patientPrompt = (drug) =>
  `Provide patient-friendly information for the drug: ${drug}. Return ONLY the JSON object.`;
const professionalPrompt = (drug) =>
  `Provide detailed technical information for the drug: ${drug}, intended for a healthcare professional.`;
const imagePrompt =
  'Identify the drug name, strength, and form from this image. Provide only the name and strength.';

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  process.env.GEMINI_API_KEY = 'test-key';

  client = await MongoClient.connect(uri);

  installGeminiStub();
  handler = require('./generate.js');
});

test.after(async () => {
  // The handler opens its own pooled connection; leaving it open hangs the runner.
  await require('./db.js').closeDatabase();
  await client?.close();
  await mongod?.stop();
});

test.beforeEach(async () => {
  geminiCalls = 0;
  resolveCalls = 0;
  installGeminiStub();
  const db = client.db(DB_NAME);
  await db.collection('medications').deleteMany({});
  await db.collection('professional_medications').deleteMany({});
  await db.collection('medication_aliases').deleteMany({});
  // Every test shares one caller identity, so without this the suite
  // rate-limits itself partway through.
  await db.collection('rate_limits').deleteMany({});
});

test('first lookup calls Gemini and stores the result', async () => {
  const res = await invoke({ contents: patientPrompt('Aspirin') });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.cached, false);
  assert.equal(geminiCalls, 1);

  const stored = await client.db(DB_NAME).collection('medications').findOne({ _id: 'aspirin' });
  assert.ok(stored, 'expected the result to be cached');
  assert.ok(stored.updatedAt instanceof Date);
});

test('repeat lookup is served from cache without calling Gemini', async () => {
  await invoke({ contents: patientPrompt('Aspirin') });
  assert.equal(geminiCalls, 1);

  const res = await invoke({ contents: patientPrompt('Aspirin') });

  assert.equal(res.payload.cached, true);
  assert.equal(geminiCalls, 1, 'second lookup must not reach Gemini');
});

test('lookup is case and whitespace insensitive', async () => {
  await invoke({ contents: patientPrompt('Aspirin') });
  const res = await invoke({ contents: patientPrompt('  ASPIRIN  ') });

  assert.equal(res.payload.cached, true);
  assert.equal(geminiCalls, 1);
});

test('entries older than the max age are refetched and refreshed', async () => {
  await invoke({ contents: patientPrompt('Aspirin') });
  assert.equal(geminiCalls, 1);

  // Age the entry past the 180-day window.
  const sevenMonthsAgo = new Date(Date.now() - 210 * 24 * 60 * 60 * 1000);
  await client
    .db(DB_NAME)
    .collection('medications')
    .updateOne({ _id: 'aspirin' }, { $set: { updatedAt: sevenMonthsAgo } });

  const res = await invoke({ contents: patientPrompt('Aspirin') });

  assert.equal(res.payload.cached, false, 'stale entry must not be served');
  assert.equal(geminiCalls, 2, 'stale entry must be refetched');

  const refreshed = await client
    .db(DB_NAME)
    .collection('medications')
    .findOne({ _id: 'aspirin' });
  assert.ok(refreshed.updatedAt > sevenMonthsAgo, 'entry should be refreshed in place');

  const count = await client.db(DB_NAME).collection('medications').countDocuments({ _id: 'aspirin' });
  assert.equal(count, 1, 'refresh must update, not duplicate');
});

test('entries just inside the max age are still served from cache', async () => {
  await invoke({ contents: patientPrompt('Aspirin') });

  const fiveMonthsAgo = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000);
  await client
    .db(DB_NAME)
    .collection('medications')
    .updateOne({ _id: 'aspirin' }, { $set: { updatedAt: fiveMonthsAgo } });

  const res = await invoke({ contents: patientPrompt('Aspirin') });

  assert.equal(res.payload.cached, true);
  assert.equal(geminiCalls, 1);
});

test('legacy entries with no updatedAt are treated as stale', async () => {
  await invoke({ contents: patientPrompt('Aspirin') });
  await client
    .db(DB_NAME)
    .collection('medications')
    .updateOne({ _id: 'aspirin' }, { $unset: { updatedAt: '' } });

  const res = await invoke({ contents: patientPrompt('Aspirin') });

  assert.equal(res.payload.cached, false);
  assert.equal(geminiCalls, 2);
});

test('patient and professional views are cached separately', async () => {
  await invoke({ contents: patientPrompt('Aspirin') });
  const res = await invoke({ contents: professionalPrompt('Aspirin') });

  assert.equal(res.payload.cached, false, 'professional view has its own cache');
  assert.equal(geminiCalls, 2);

  const prof = await client
    .db(DB_NAME)
    .collection('professional_medications')
    .findOne({ _id: 'aspirin' });
  assert.ok(prof, 'professional result should be stored in its own collection');

  // And the professional view then caches on its own.
  const again = await invoke({ contents: professionalPrompt('Aspirin') });
  assert.equal(again.payload.cached, true);
  assert.equal(geminiCalls, 2);
});

test('image identification is never cached', async () => {
  await invoke({ contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'x' } }, { text: imagePrompt }] } });
  await invoke({ contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'y' } }, { text: imagePrompt }] } });

  assert.equal(geminiCalls, 2, 'each photo must be identified fresh');
  const count = await client.db(DB_NAME).collection('medications').countDocuments({});
  assert.equal(count, 0, 'photos must not populate the cache');
});

test('a drug identified from a photo still hits the cache for its details', async () => {
  // Someone searches by text first.
  await invoke({ contents: patientPrompt('Aspirin') });
  assert.equal(geminiCalls, 1);

  // Someone else photographs the same box: identification is a fresh call...
  await invoke({ contents: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'x' } }, { text: imagePrompt }] } });
  assert.equal(geminiCalls, 2);

  // ...but the details lookup that follows is served from cache.
  const res = await invoke({ contents: patientPrompt('Aspirin') });
  assert.equal(res.payload.cached, true);
  assert.equal(geminiCalls, 2, 'details for an already-known drug must not re-hit Gemini');
});

test('two different users searching the same drug get identical text', async () => {
  // The point of the cache is consistency: whoever asks second must see exactly
  // what the first person saw, not a fresh answer the model worded differently.
  const first = await invoke({ contents: patientPrompt('Aspirin') });
  const second = await invoke({ contents: patientPrompt('aspirin') });

  assert.equal(second.payload.cached, true);
  assert.equal(second.payload.text, first.payload.text, 'both users must see the same answer');
  assert.equal(geminiCalls, 1, 'only the first user should cost a Gemini call');
});

test('ten repeat searches cost exactly one Gemini call', async () => {
  for (let i = 0; i < 10; i++) {
    await invoke({ contents: patientPrompt('Ibuprofen') });
  }
  assert.equal(geminiCalls, 1, 'nine of the ten searches must be free');
});

test('a stored entry has the fields the cache relies on', async () => {
  await invoke({ contents: patientPrompt('Paracetamol 500mg') });

  const doc = await client
    .db(DB_NAME)
    .collection('medications')
    .findOne({ _id: 'paracetamol' });

  assert.ok(doc, 'entry should exist under its canonical key, with the strength stripped');
  assert.equal(doc.canonicalKey, 'paracetamol');
  assert.equal(doc.language, 'en', 'cache is stored in English and translated on the client');
  assert.ok(doc.data, 'parsed drug data should be stored');
  assert.ok(doc.createdAt instanceof Date, 'createdAt is needed to audit age');
  assert.ok(doc.updatedAt instanceof Date, 'updatedAt drives expiry');
});

test('different drugs are stored as separate entries', async () => {
  await invoke({ contents: patientPrompt('Aspirin') });
  await invoke({ contents: patientPrompt('Ibuprofen') });

  const names = (await client.db(DB_NAME).collection('medications').find({}).toArray())
    .map((d) => d._id)
    .sort();

  assert.deepEqual(names, ['aspirin', 'ibuprofen']);
  assert.equal(geminiCalls, 2);
});

// ── Malformed model responses ────────────────────────────────────────────────
// The model sometimes ignores the requested key names and returns snake_case
// instead. That produced undefined fields, a .map() crash, and a blank screen —
// and the bad answer was cached and served to everyone.

const snakeCaseAnswer = {
  drug_name: 'Cetirizine',
  strength: '10mg',
  common_uses: 'Relieves allergy symptoms.',
  how_to_take_it: 'One tablet daily.',
  what_to_expect: 'May cause mild drowsiness.',
  if_you_miss_a_dose: 'Take it when you remember.',
  common_side_effects: ['Drowsiness', 'Dry mouth'],
  serious_side_effects: ['Fast heartbeat'],
  when_to_call_your_doctor: ['Severe dizziness'],
  storage_instructions: 'Store below 25C.',
};

const stubGeminiWith = (payload) => installGeminiStub(payload);

test('snake_case keys from the model are mapped onto the shape the UI needs', async () => {
  stubGeminiWith(snakeCaseAnswer);
  const res = await invoke({ contents: patientPrompt('Cetirizine') });
  const info = JSON.parse(res.payload.text);

  assert.equal(info.drugName, 'Cetirizine', 'drug_name should become drugName');
  assert.equal(info.commonUse, 'Relieves allergy symptoms.');
  assert.deepEqual(info.commonSideEffects, ['Drowsiness', 'Dry mouth']);
  assert.deepEqual(info.consultDoctorWhen, ['Severe dizziness']);
});

test('every list field is always an array, so the UI can never crash on .map()', async () => {
  stubGeminiWith({ drug_name: 'X', common_uses: 'Y' }); // lists entirely absent
  const res = await invoke({ contents: patientPrompt('Sparse') });
  const info = JSON.parse(res.payload.text);

  for (const field of ['commonSideEffects', 'seriousSideEffects', 'consultDoctorWhen']) {
    assert.ok(Array.isArray(info[field]), `${field} must be an array`);
  }
  for (const field of ['drugName', 'strength', 'commonUse', 'storage']) {
    assert.equal(typeof info[field], 'string', `${field} must be a string`);
  }
});

test('a response too malformed to render is not cached', async () => {
  stubGeminiWith({ nonsense: true });
  const first = await invoke({ contents: patientPrompt('Garbage') });
  assert.equal(first.payload.cached, false);

  const stored = await client
    .db(DB_NAME)
    .collection('medications')
    .findOne({ _id: 'garbage' });
  assert.equal(stored, null, 'a broken answer must not poison the cache');
});

test('an entry already cached in the wrong shape is repaired when served', async () => {
  // The exact shape found in production: the model had used snake_case, the UI
  // read undefined for every field and crashed to a blank screen.
  await client.db(DB_NAME).collection('medications').insertOne({
    _id: 'cetirizine',
    canonicalKey: 'cetirizine',
    language: 'en',
    data: snakeCaseAnswer,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  geminiCalls = 0;
  const res = await invoke({ contents: patientPrompt('Cetirizine') });

  assert.equal(res.payload.cached, true, 'it is still a cache hit');
  assert.equal(geminiCalls, 0, 'repairing must not cost a Gemini call');

  const info = JSON.parse(res.payload.text);
  assert.equal(info.drugName, 'Cetirizine', 'served in the shape the UI needs');
  assert.ok(Array.isArray(info.commonSideEffects));
  assert.ok(Array.isArray(info.consultDoctorWhen));
});

test('a cached entry too broken to repair is refetched', async () => {
  await client.db(DB_NAME).collection('medications').insertOne({
    _id: 'broken',
    canonicalKey: 'broken',
    language: 'en',
    data: { totally: 'unrelated' },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  geminiCalls = 0;
  const res = await invoke({ contents: patientPrompt('Broken') });

  assert.equal(res.payload.cached, false, 'unrepairable entries count as a miss');
  assert.equal(geminiCalls, 1, 'and are refetched');

  const repaired = await client
    .db(DB_NAME)
    .collection('medications')
    .findOne({ _id: 'broken' });
  assert.equal(repaired.data.drugName, 'Broken', 'and rewritten correctly');
});

// ── Refusing to invent medications ───────────────────────────────────────────
// The app used to render a full drug page for anything at all — "banana" came
// back as a medication with invented side effects, and that answer was cached
// and served to every later user.

const notAMedication = (name, what, warning = '') => ({
  recognition: 'unknown',
  identifiedAs: what,
  safetyNote: warning,
  drugName: '',
  strength: '',
  commonUse: '',
  dosageAdministration: '',
  foodDrinkEffect: '',
  missedDose: '',
  commonSideEffects: [],
  seriousSideEffects: [],
  consultDoctorWhen: [],
  storage: '',
});

test('a non-medication is never written to the shared cache', async () => {
  stubGeminiWith(notAMedication('banana', 'A banana is a fruit, not a medicine.'));
  const res = await invoke({ contents: patientPrompt('banana') });

  assert.equal(res.statusCode, 200);
  const stored = await client
    .db(DB_NAME)
    .collection('medications')
    .findOne({ _id: 'banana' });
  assert.equal(stored, null, 'junk must not become durable shared data');
});

test('the classification survives to the client', async () => {
  stubGeminiWith(notAMedication('banana', 'A banana is a fruit, not a medicine.'));
  const res = await invoke({ contents: patientPrompt('banana') });
  const payload = JSON.parse(res.payload.text);

  assert.equal(payload.recognition, 'unknown', 'the UI needs this to refuse the drug page');
  assert.equal(payload.identifiedAs, 'A banana is a fruit, not a medicine.');
});

test('no side effects are invented for something that is not a drug', async () => {
  stubGeminiWith(notAMedication('asdfghjkl', 'This does not match any known medicine.'));
  const res = await invoke({ contents: patientPrompt('asdfghjkl') });
  const payload = JSON.parse(res.payload.text);

  for (const field of ['commonSideEffects', 'seriousSideEffects', 'consultDoctorWhen']) {
    assert.deepEqual(payload[field], [], `${field} must stay empty`);
  }
});

test('a dangerous substance is surfaced with its warning but not cached as a drug', async () => {
  stubGeminiWith({
    ...notAMedication('cyanide', 'Cyanide is a chemical poison, not a medicine.'),
    recognition: 'substance',
    safetyNote: 'Cyanide is extremely toxic. If someone has swallowed it, call emergency services immediately.',
  });

  const res = await invoke({ contents: patientPrompt('cyanide') });
  const payload = JSON.parse(res.payload.text);

  assert.equal(payload.recognition, 'substance');
  assert.match(payload.safetyNote, /emergency services/i, 'the safety warning must reach the user');

  const stored = await client
    .db(DB_NAME)
    .collection('medications')
    .findOne({ _id: 'cyanide' });
  assert.equal(stored, null, 'a poison is not a medication and must not be cached as one');
});

test('a model that claims "medication" but returns nothing is still rejected', async () => {
  // Guards against the classification being trusted blindly.
  stubGeminiWith({ ...notAMedication('ghost', ''), recognition: 'medication' });
  await invoke({ contents: patientPrompt('ghost') });

  const stored = await client
    .db(DB_NAME)
    .collection('medications')
    .findOne({ _id: 'ghost' });
  assert.equal(stored, null, 'an empty record must not be cached even when labelled a medication');
});

test('a real medication is unaffected and still caches', async () => {
  stubGeminiWith({ ...VALID_ANSWER, recognition: 'medication', identifiedAs: '', safetyNote: '' });

  const first = await invoke({ contents: patientPrompt('Aspirin') });
  assert.equal(first.payload.cached, false);
  assert.equal(JSON.parse(first.payload.text).recognition, 'medication');

  const second = await invoke({ contents: patientPrompt('Aspirin') });
  assert.equal(second.payload.cached, true, 'genuine medicines must still cache normally');
  assert.equal(geminiCalls, 1);
});

test('entries cached before classification existed are still served', async () => {
  // Backwards compatibility: no recognition field, but a complete drug record.
  const legacy = { ...VALID_ANSWER };
  delete legacy.recognition;
  await client.db(DB_NAME).collection('medications').insertOne({
    _id: 'legacydrug',
    canonicalKey: 'legacydrug',
    language: 'en',
    data: legacy,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  geminiCalls = 0;
  const res = await invoke({ contents: patientPrompt('LegacyDrug') });

  assert.equal(res.payload.cached, true, 'existing good entries must not be thrown away');
  assert.equal(geminiCalls, 0);
  assert.equal(JSON.parse(res.payload.text).recognition, 'medication');
});

// ── One medicine, one entry ──────────────────────────────────────────────────
// The cache used to be keyed on whatever was typed, so "panadooll", "Panadol
// 500mg" and "paracetamol" were three rows, three Gemini calls and three
// differently worded answers for one drug. Answers are now keyed on the generic
// ingredient the model resolves the query to, and search terms point at them.

const aliases = () => client.db(DB_NAME).collection('medication_aliases');
const medications = () => client.db(DB_NAME).collection('medications');

test('every spelling of one medicine lands on a single entry', async () => {
  await invoke({ contents: patientPrompt('Panadol') });
  await invoke({ contents: patientPrompt('panadooll') });
  await invoke({ contents: patientPrompt('PANADOL 500mg tablets') });
  await invoke({ contents: patientPrompt('Acetaminophen') });

  const docs = await medications().find({}).toArray();
  assert.equal(docs.length, 1, 'four spellings must not create four rows');
  assert.equal(docs[0]._id, 'paracetamol', 'stored under the ingredient, not the typo');

  assert.equal(geminiCalls, 1, 'the full answer is generated exactly once');
});

test('a spelling nobody has used before costs a resolution, not a full answer', async () => {
  await invoke({ contents: patientPrompt('Panadol') });
  assert.equal(geminiCalls, 1);

  // Nothing in the database has ever seen this spelling.
  const res = await invoke({ contents: patientPrompt('panadooll') });

  assert.equal(res.payload.cached, true, 'served from the existing entry');
  assert.equal(geminiCalls, 1, 'no second answer was generated');
  assert.ok(resolveCalls >= 1, 'it was resolved with the cheap call instead');
});

test('the second person to use a spelling costs nothing at all', async () => {
  await invoke({ contents: patientPrompt('Panadol') });
  await invoke({ contents: patientPrompt('panadooll') });
  const callsSoFar = geminiCalls + resolveCalls;

  const res = await invoke({ contents: patientPrompt('panadooll') });

  assert.equal(res.payload.cached, true);
  assert.equal(geminiCalls + resolveCalls, callsSoFar, 'the alias made it free');
});

test('typing the ingredient itself needs no alias and no resolution', async () => {
  await invoke({ contents: patientPrompt('Paracetamol') });
  const before = geminiCalls + resolveCalls;

  const res = await invoke({ contents: patientPrompt('paracetamol') });

  assert.equal(res.payload.cached, true);
  assert.equal(geminiCalls + resolveCalls, before, 'a direct hit costs nothing');
  assert.equal(await aliases().countDocuments({}), 0, 'a self-alias would be dead weight');
});

test('search terms are recorded as pointers, not as copies', async () => {
  await invoke({ contents: patientPrompt('Panadol') });
  await invoke({ contents: patientPrompt('panadooll') });

  const rows = await aliases().find({}).sort({ _id: 1 }).toArray();
  assert.deepEqual(rows.map((r) => r._id), ['panadol', 'panadooll']);
  assert.ok(rows.every((r) => r.canonicalKey === 'paracetamol'), 'both point at the ingredient');
  assert.ok(rows.every((r) => r.resolvedName), 'each records what it resolved to, for auditing');

  // The point of a pointer is that it is small. A real answer runs to about
  // 2.5 KB; the stub's is much shorter, so this asserts a fixed budget rather
  // than a ratio against it.
  const answerBytes = JSON.stringify(await medications().findOne({ _id: 'paracetamol' })).length;
  const aliasBytes = JSON.stringify(rows[0]).length;
  assert.ok(aliasBytes < 300, `an alias should be a couple of hundred bytes, got ${aliasBytes}B`);
  assert.ok(aliasBytes < answerBytes, 'and always smaller than the answer it points at');
});

test('strength and dosage form never create a separate entry', async () => {
  await invoke({ contents: patientPrompt('Ibuprofen 400mg') });
  const res = await invoke({ contents: patientPrompt('ibuprofen 200 mg tablets') });

  assert.equal(res.payload.cached, true, 'the answer already lists every strength');
  assert.equal(geminiCalls, 1);
  assert.equal(await medications().countDocuments({}), 1);
});

test('an Arabic brand name reaches the same entry as the English one', async () => {
  await invoke({ contents: patientPrompt('Panadol') });
  const res = await invoke({ contents: patientPrompt('بنادول') });

  assert.equal(res.payload.cached, true, 'Arabic speakers hit the shared cache too');
  assert.equal(geminiCalls, 1);
  const alias = await aliases().findOne({ _id: 'بنادول' });
  assert.equal(alias.canonicalKey, 'paracetamol');
});

test('everyone gets byte-identical text however they spelled it', async () => {
  const a = await invoke({ contents: patientPrompt('Panadol') });
  const b = await invoke({ contents: patientPrompt('panadooll') });
  const c = await invoke({ contents: patientPrompt('Acetaminophen') });

  assert.equal(a.payload.text, b.payload.text);
  assert.equal(b.payload.text, c.payload.text);
});

test('different medicines still get their own entries', async () => {
  await invoke({ contents: patientPrompt('Panadol') });
  await invoke({ contents: patientPrompt('Brufen') });

  const ids = (await medications().find({}).toArray()).map((d) => d._id).sort();
  assert.deepEqual(ids, ['ibuprofen', 'paracetamol'], 'merging must not go too far');
  assert.equal(geminiCalls, 2);
});

test('the professional view reuses the mapping the patient lookup built', async () => {
  await invoke({ contents: patientPrompt('Panadol') });
  await invoke({ contents: professionalPrompt('Panadol') });
  assert.equal(geminiCalls, 2, 'the two audiences have separate answers');

  const prof = await client.db(DB_NAME).collection('professional_medications').find({}).toArray();
  assert.equal(prof.length, 1);
  assert.equal(prof[0]._id, 'paracetamol', 'keyed by ingredient, via the shared alias table');

  // A different spelling now hits the professional entry as well.
  const res = await invoke({ contents: professionalPrompt('panadooll') });
  assert.equal(res.payload.cached, true);
  assert.equal(geminiCalls, 2);
});

test('a non-medication never gets an alias either', async () => {
  installGeminiStub({
    recognition: 'unknown',
    identifiedAs: 'A banana is a fruit, not a medicine.',
    safetyNote: '',
    drugName: '',
  });

  await invoke({ contents: patientPrompt('Banana') });

  assert.equal(await medications().countDocuments({}), 0);
  assert.equal(await aliases().countDocuments({}), 0, 'junk must not pollute the alias table');
});

test('a failed resolution falls back to generating the answer', async () => {
  const working = global.fetch;
  global.fetch = async (url, init) => {
    const promptText = String(init.body || '');
    if (promptText.includes('generic active ingredient')) throw new Error('resolver unavailable');
    return working(url, init);
  };

  const res = await invoke({ contents: patientPrompt('Panadol') });

  assert.equal(res.statusCode, 200, 'the user still gets their answer');
  assert.equal(res.payload.cached, false);
  assert.equal(geminiCalls, 1);
  assert.equal(await medications().countDocuments({}), 1, 'and it is still cached correctly');
});

test('expiry still works through an alias', async () => {
  await invoke({ contents: patientPrompt('Panadol') });
  await invoke({ contents: patientPrompt('panadooll') });
  assert.equal(geminiCalls, 1);

  const sevenMonthsAgo = new Date(Date.now() - 210 * 24 * 60 * 60 * 1000);
  await medications().updateOne({ _id: 'paracetamol' }, { $set: { updatedAt: sevenMonthsAgo } });

  const res = await invoke({ contents: patientPrompt('panadooll') });

  assert.equal(res.payload.cached, false, 'a stale entry is refreshed even when reached by alias');
  assert.equal(geminiCalls, 2);
  assert.equal(await medications().countDocuments({}), 1, 'and refreshed in place, not duplicated');
});

// ── Rate limiting ────────────────────────────────────────────────────────────
// Without a limit, one script looping unique drug names drains the Gemini
// budget in minutes; the cache is no defence because every request is new.

const rateLimit = require('./_rateLimit.js');

/** A request from a given address, as Vercel would present it. */
const from = (ip) => ({ 'x-forwarded-for': ip });

const invokeFrom = (ip, body) =>
  new Promise((resolve) => {
    const req = { method: 'POST', headers: from(ip), body };
    let statusCode = 200;
    const headers = {};
    const res = {
      setHeader(k, v) { headers[k] = v; },
      status(code) { statusCode = code; return res; },
      json(payload) { resolve({ statusCode, payload, headers }); return res; },
      end() { resolve({ statusCode, payload: undefined, headers }); return res; },
    };
    handler(req, res);
  });

const clearLimits = () => client.db(DB_NAME).collection('rate_limits').deleteMany({});

test('a caller is blocked after exceeding the per-minute allowance', async () => {
  await clearLimits();
  const limit = rateLimit.LIMITS.generate;

  let lastOk = null;
  for (let i = 0; i < limit; i++) {
    lastOk = await invokeFrom('203.0.113.10', { contents: patientPrompt(`Drug${i}`) });
  }
  assert.equal(lastOk.statusCode, 200, 'requests within the allowance must succeed');

  const blocked = await invokeFrom('203.0.113.10', { contents: patientPrompt('OneTooMany') });
  assert.equal(blocked.statusCode, 429);
  assert.match(blocked.payload.error, /wait a moment/i, 'the message must read as advice, not an error');
  assert.ok(Number(blocked.headers['Retry-After']) > 0, 'Retry-After must tell the client when to retry');
});

test('one caller being blocked does not affect anybody else', async () => {
  await clearLimits();
  const limit = rateLimit.LIMITS.generate;

  for (let i = 0; i <= limit; i++) {
    await invokeFrom('203.0.113.20', { contents: patientPrompt(`Flood${i}`) });
  }
  const attacker = await invokeFrom('203.0.113.20', { contents: patientPrompt('Blocked') });
  assert.equal(attacker.statusCode, 429);

  const bystander = await invokeFrom('203.0.113.21', { contents: patientPrompt('Aspirin') });
  assert.equal(bystander.statusCode, 200, 'a different caller must be unaffected');
});

test('cached lookups still count towards the caller limit', async () => {
  await clearLimits();
  // Flooding one cached drug is still a flood, even though it costs nothing.
  await invokeFrom('203.0.113.30', { contents: patientPrompt('Aspirin') });

  const limit = rateLimit.LIMITS.generate;
  for (let i = 1; i <= limit; i++) {
    await invokeFrom('203.0.113.30', { contents: patientPrompt('Aspirin') });
  }
  const blocked = await invokeFrom('203.0.113.30', { contents: patientPrompt('Aspirin') });
  assert.equal(blocked.statusCode, 429);
});

test('cache hits do not spend the daily budget', async () => {
  await clearLimits();
  await invokeFrom('203.0.113.40', { contents: patientPrompt('Aspirin') }); // fills the cache

  const before = await client
    .db(DB_NAME)
    .collection('rate_limits')
    .findOne({ _id: { $regex: '^global:' } });

  const cached = await invokeFrom('203.0.113.41', { contents: patientPrompt('Aspirin') });
  assert.equal(cached.payload.cached, true);

  const after = await client
    .db(DB_NAME)
    .collection('rate_limits')
    .findOne({ _id: { $regex: '^global:' } });

  assert.equal(after.count, before.count, 'a free request must not eat into the paid budget');
});

test('the daily budget stops requests that would reach Gemini', async () => {
  await clearLimits();
  // Pre-set the global counter to its ceiling.
  const windowStart = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
  await client.db(DB_NAME).collection('rate_limits').insertOne({
    _id: `global:gemini:${windowStart}`,
    count: rateLimit.GLOBAL_PER_DAY,
    expiresAt: new Date(windowStart + 2 * 24 * 60 * 60 * 1000),
  });

  geminiCalls = 0;
  const blocked = await invokeFrom('203.0.113.50', { contents: patientPrompt('SomethingNew') });

  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.payload.scope, 'daily');
  assert.equal(geminiCalls, 0, 'nothing may reach Gemini once the budget is spent');
});

test('already-cached medicines keep working after the daily budget is spent', async () => {
  await clearLimits();
  await invokeFrom('203.0.113.60', { contents: patientPrompt('Aspirin') }); // cache it

  const windowStart = Math.floor(Date.now() / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
  await client.db(DB_NAME).collection('rate_limits').updateOne(
    { _id: `global:gemini:${windowStart}` },
    { $set: { count: rateLimit.GLOBAL_PER_DAY, expiresAt: new Date(windowStart + 2 * 86400000) } },
    { upsert: true },
  );

  const res = await invokeFrom('203.0.113.61', { contents: patientPrompt('Aspirin') });
  assert.equal(res.statusCode, 200, 'the app must not go dark once the budget is spent');
  assert.equal(res.payload.cached, true);
});

test('addresses are stored hashed, never in the clear', async () => {
  await clearLimits();
  await invokeFrom('198.51.100.7', { contents: patientPrompt('Aspirin') });

  const docs = await client.db(DB_NAME).collection('rate_limits').find({}).toArray();
  const ids = docs.map((d) => d._id).join(' ');
  assert.ok(!ids.includes('198.51.100.7'), 'a raw address must never be written to the database');
  assert.ok(ids.includes(rateLimit.callerKey({ headers: from('198.51.100.7') })), 'the hash should be present');
});

test('the limiter fails open when the database is unavailable', async () => {
  // A broken limiter must never take the app down with it.
  const original = rateLimit.checkRequestLimit;
  const result = await original({ headers: {} }, 'generate');
  assert.equal(typeof result.allowed, 'boolean');

  const { closeDatabase } = require('./db.js');
  await closeDatabase();
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/none?serverSelectionTimeoutMS=200';
  delete require.cache[require.resolve('./db.js')];
  delete require.cache[require.resolve('./_rateLimit.js')];
  const isolated = require('./_rateLimit.js');

  const offline = await isolated.checkRequestLimit({ headers: from('203.0.113.99') });
  assert.equal(offline.allowed, true, 'requests must be allowed when the limiter cannot reach the database');

  // Restore for any later test.
  process.env.MONGODB_URI = mongod.getUri();
  delete require.cache[require.resolve('./db.js')];
  delete require.cache[require.resolve('./_rateLimit.js')];
});
