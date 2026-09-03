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

/** Counts Gemini calls without making any. */
function installGeminiStub(payload = VALID_ANSWER) {
  global.fetch = async () => {
    geminiCalls++;
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
      }),
    };
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
  installGeminiStub();
  const db = client.db(DB_NAME);
  await db.collection('medications').deleteMany({});
  await db.collection('professional_medications').deleteMany({});
});

test('first lookup calls Gemini and stores the result', async () => {
  const res = await invoke({ contents: patientPrompt('Aspirin') });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.cached, false);
  assert.equal(geminiCalls, 1);

  const stored = await client.db(DB_NAME).collection('medications').findOne({ normalizedName: 'aspirin' });
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
    .updateOne({ normalizedName: 'aspirin' }, { $set: { updatedAt: sevenMonthsAgo } });

  const res = await invoke({ contents: patientPrompt('Aspirin') });

  assert.equal(res.payload.cached, false, 'stale entry must not be served');
  assert.equal(geminiCalls, 2, 'stale entry must be refetched');

  const refreshed = await client
    .db(DB_NAME)
    .collection('medications')
    .findOne({ normalizedName: 'aspirin' });
  assert.ok(refreshed.updatedAt > sevenMonthsAgo, 'entry should be refreshed in place');

  const count = await client.db(DB_NAME).collection('medications').countDocuments({ normalizedName: 'aspirin' });
  assert.equal(count, 1, 'refresh must update, not duplicate');
});

test('entries just inside the max age are still served from cache', async () => {
  await invoke({ contents: patientPrompt('Aspirin') });

  const fiveMonthsAgo = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000);
  await client
    .db(DB_NAME)
    .collection('medications')
    .updateOne({ normalizedName: 'aspirin' }, { $set: { updatedAt: fiveMonthsAgo } });

  const res = await invoke({ contents: patientPrompt('Aspirin') });

  assert.equal(res.payload.cached, true);
  assert.equal(geminiCalls, 1);
});

test('legacy entries with no updatedAt are treated as stale', async () => {
  await invoke({ contents: patientPrompt('Aspirin') });
  await client
    .db(DB_NAME)
    .collection('medications')
    .updateOne({ normalizedName: 'aspirin' }, { $unset: { updatedAt: '' } });

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
    .findOne({ normalizedName: 'aspirin' });
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
    .findOne({ normalizedName: 'paracetamol 500mg' });

  assert.ok(doc, 'entry should exist under its normalised name');
  assert.equal(doc.language, 'en', 'cache is stored in English and translated on the client');
  assert.ok(doc.data, 'parsed drug data should be stored');
  assert.ok(doc.createdAt instanceof Date, 'createdAt is needed to audit age');
  assert.ok(doc.updatedAt instanceof Date, 'updatedAt drives expiry');
});

test('different drugs are stored as separate entries', async () => {
  await invoke({ contents: patientPrompt('Aspirin') });
  await invoke({ contents: patientPrompt('Ibuprofen') });

  const names = (await client.db(DB_NAME).collection('medications').find({}).toArray())
    .map((d) => d.normalizedName)
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
    .findOne({ normalizedName: 'garbage' });
  assert.equal(stored, null, 'a broken answer must not poison the cache');
});

test('an entry already cached in the wrong shape is repaired when served', async () => {
  // The exact shape found in production: the model had used snake_case, the UI
  // read undefined for every field and crashed to a blank screen.
  await client.db(DB_NAME).collection('medications').insertOne({
    normalizedName: 'cetirizine',
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
    normalizedName: 'broken',
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
    .findOne({ normalizedName: 'broken' });
  assert.equal(repaired.data.drugName, 'Stub Drug', 'and rewritten correctly');
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
    .findOne({ normalizedName: 'banana' });
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
    .findOne({ normalizedName: 'cyanide' });
  assert.equal(stored, null, 'a poison is not a medication and must not be cached as one');
});

test('a model that claims "medication" but returns nothing is still rejected', async () => {
  // Guards against the classification being trusted blindly.
  stubGeminiWith({ ...notAMedication('ghost', ''), recognition: 'medication' });
  await invoke({ contents: patientPrompt('ghost') });

  const stored = await client
    .db(DB_NAME)
    .collection('medications')
    .findOne({ normalizedName: 'ghost' });
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
    normalizedName: 'legacydrug',
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
