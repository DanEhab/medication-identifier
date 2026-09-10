// Tests api/suggest.js against a real mongod.
//
//   npm test
//
// Nothing here reaches Gemini: suggestions are read out of the cache that
// /api/generate has already filled, which is the whole point of the endpoint.

const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');

const DB_NAME = 'medication_identifier';

let mongod;
let client;
let handler;

/** Minimal stand-in for the req/res pair Vercel provides. */
function invoke(q, { method = 'GET' } = {}) {
  const req = method === 'GET'
    ? { method, headers: {}, query: { q } }
    : { method, headers: {}, body: { q } };
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

/** An answer document in the shape /api/generate writes. */
const answer = (id, data) => ({
  _id: id,
  canonicalKey: id,
  language: 'en',
  data,
  createdAt: new Date(),
  updatedAt: new Date(),
});

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  client = await MongoClient.connect(mongod.getUri());
  handler = require('./suggest.js');
});

test.after(async () => {
  await require('./db.js').closeDatabase();
  await client?.close();
  await mongod?.stop();
});

test.beforeEach(async () => {
  const db = client.db(DB_NAME);
  await db.collection('medications').deleteMany({});
  await db.collection('medication_aliases').deleteMany({});
  // Every test shares one caller identity, so without this the suite
  // rate-limits itself partway through.
  await db.collection('rate_limits').deleteMany({});

  await db.collection('medications').insertMany([
    answer('atorvastatin', {
      drugName: 'Atorvastatin', brandName: 'Lipitor',
      canonicalName: 'Atorvastatin calcium', strength: '10, 20, 40, 80 mg',
    }),
    answer('atorvastatin+ezetimibe', {
      drugName: 'Atorvastatin + ezetimibe', brandName: 'Atorvastatin + ezetimibe',
      canonicalName: 'Atorvastatin + ezetimibe', strength: '20/10 mg',
    }),
    answer('paracetamol', {
      drugName: 'Paracetamol', brandName: 'Panadol',
      canonicalName: 'Paracetamol', strength: '500 mg',
    }),
  ]);

  await db.collection('medication_aliases').insertMany([
    { _id: 'atorvastat', canonicalKey: 'atorvastatin', resolvedName: 'Atorvastat', updatedAt: new Date() },
    // No resolvedName: a professional lookup wrote this one, and it names
    // nothing a person could be shown.
    { _id: 'atorva-nameless', canonicalKey: 'atorvastatin', updatedAt: new Date() },
  ]);
});

test('a prefix matches the medicines already answered for', async () => {
  const res = await invoke('atorva');

  assert.equal(res.statusCode, 200);
  const names = res.payload.suggestions.map((s) => s.name);
  assert.ok(names.includes('Atorvastat'), 'the alias somebody typed before');
  assert.ok(names.includes('Atorvastatin + ezetimibe'));
  assert.ok(!names.includes('Panadol'), 'and nothing that does not match');
});

test('the name shown is the one on the pack, not the lookup key', async () => {
  const res = await invoke('paracetamol');
  const [first] = res.payload.suggestions;
  assert.equal(first.name, 'Panadol', 'the brand, capitalised as it was written');
  assert.ok(!res.payload.suggestions.some((s) => s.name === 'paracetamol'), 'never the raw key');
});

test('the detail line carries the ingredient and the strengths', async () => {
  const res = await invoke('paracetamol');
  const [first] = res.payload.suggestions;
  assert.equal(first.detail, 'Paracetamol · 500 mg');
});

test('a brand whose detail would repeat its own name does not repeat it', async () => {
  await client.db(DB_NAME).collection('medications').insertOne(
    answer('ibuprofen', { drugName: 'Ibuprofen', brandName: 'Ibuprofen', canonicalName: 'Ibuprofen', strength: '400 mg' }),
  );
  const res = await invoke('ibupro');
  assert.equal(res.payload.suggestions[0].detail, '400 mg');
});

test('an alias with no resolved name is never offered', async () => {
  const res = await invoke('atorva');
  assert.ok(
    res.payload.suggestions.every((s) => s.name && s.name.trim()),
    'a blank row would be a tappable nothing',
  );
  assert.ok(!res.payload.suggestions.some((s) => s.name === 'atorva-nameless'));
});

test('one medicine is offered once, however many ways it was reached', async () => {
  await client.db(DB_NAME).collection('medication_aliases').insertOne(
    { _id: 'panadolx', canonicalKey: 'paracetamol', resolvedName: 'Panadol', updatedAt: new Date() },
  );
  const res = await invoke('pa');
  const panadols = res.payload.suggestions.filter((s) => s.name.toLowerCase() === 'panadol');
  assert.equal(panadols.length, 1);
});

test('shorter names come first, being likelier to be what was meant', async () => {
  const res = await invoke('atorva');
  const lengths = res.payload.suggestions.map((s) => s.name.length);
  assert.deepEqual(lengths, [...lengths].sort((a, b) => a - b));
});

test('one letter suggests nothing, since everything would match', async () => {
  const res = await invoke('a');
  assert.deepEqual(res.payload.suggestions, []);
});

test('punctuation in the query cannot break the match', async () => {
  // "^atorva(" is not a valid expression; unescaped it would throw a 500.
  const res = await invoke('atorva(');
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.payload.suggestions));
});

test('a typed space matches the way the key was written', async () => {
  await client.db(DB_NAME).collection('medications').insertOne(
    answer('panadol extra', { drugName: 'Panadol Extra', brandName: 'Panadol Extra', canonicalName: 'Paracetamol + caffeine', strength: '500/65 mg' }),
  );
  const res = await invoke('panadol e');
  assert.ok(res.payload.suggestions.some((s) => s.name === 'Panadol Extra'), JSON.stringify(res.payload));
});

test('no more than eight are returned', async () => {
  const many = [];
  for (let i = 0; i < 20; i++) {
    many.push(answer(`zeta${i}`, { drugName: `Zeta ${i}`, brandName: `Zeta ${i}`, canonicalName: 'Zeta', strength: '1 mg' }));
  }
  await client.db(DB_NAME).collection('medications').insertMany(many);
  const res = await invoke('zeta');
  assert.equal(res.payload.suggestions.length, 8);
});

test('POST works the same as GET, for clients that cannot send a query string', async () => {
  const res = await invoke('paracetamol', { method: 'POST' });
  assert.equal(res.payload.suggestions[0].name, 'Panadol');
});

test('anything else is refused', async () => {
  const res = await invoke('paracetamol', { method: 'DELETE' });
  assert.equal(res.statusCode, 405);
});

test('a broken database returns no suggestions rather than an error', async () => {
  const good = process.env.MONGODB_URI;
  await require('./db.js').closeDatabase();
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/none?serverSelectionTimeoutMS=200';
  try {
    const res = await invoke('atorva');
    assert.equal(res.statusCode, 200, 'a broken type-ahead must never stop somebody searching');
    assert.deepEqual(res.payload.suggestions, []);
  } finally {
    await require('./db.js').closeDatabase();
    process.env.MONGODB_URI = good;
  }
});
