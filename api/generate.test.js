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

  // Count Gemini calls without making any.
  global.fetch = async () => {
    geminiCalls++;
    return {
      ok: true,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: JSON.stringify({ drugName: 'Stub', strength: '1mg' }) }] } },
        ],
      }),
    };
  };

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
