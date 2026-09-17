/**
 * Reports on the health of the answer cache.
 *
 *   node tools/dbAudit.mjs [path/to/.env]
 *   node tools/dbAudit.mjs [path/to/.env] --fix
 *
 * Read-only unless --fix is passed, so it can be pointed at production
 * without thinking about it twice. The connection string is read from the
 * environment or an env file and is never printed.
 *
 * --fix deletes only documents the server already refuses to serve. Those are
 * regenerated on the next lookup, so removing one costs a single model call
 * and nothing else; leaving one costs that same call every time somebody opens
 * that medicine until it happens to be rewritten.
 *
 * The checks import the server's own normalisers and key functions rather than
 * re-describing what a good document looks like. A report that disagrees with
 * the code it is auditing is worse than no report.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { MongoClient } from 'mongodb';

const require = createRequire(import.meta.url);
const { normalizeKey, storageKeyFor, aliasIsSafe } = require('../api/_cacheKey.js');
const { normalizeDrugInfo, isCacheableDrugInfo, hasResultFields } = require('../api/_drugInfo.js');
const {
  normalizeProfessionalInfo, isCacheableProfessionalInfo, hasProfessionalFields,
} = require('../api/_professional.js');

const readEnvFile = (path) => {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith('#'))
        .map((line) => {
          const at = line.indexOf('=');
          return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return {};
  }
};

/*
  A git worktree gets its own .env.local, and a fresh one has the key present
  but empty — which reads as "no database" rather than as "look somewhere
  else". An empty value is therefore treated the same as a missing file.
*/
const uri = [
  process.env.MONGODB_URI,
  process.argv[2] && readEnvFile(process.argv[2]).MONGODB_URI,
  readEnvFile(fileURLToPath(new URL('../.env.local', import.meta.url))).MONGODB_URI,
].find((value) => value && value.trim());

if (!uri) {
  console.error(
    'No MONGODB_URI found.\n'
    + 'Set it in the environment, pass the path to an env file as the first argument,\n'
    + 'or put it in .env.local beside package.json.',
  );
  process.exit(1);
}

const FIX = process.argv.includes('--fix');
const MAX_AGE_DAYS = Number(process.env.CACHE_MAX_AGE_DAYS || 180);
const staleBefore = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

let problems = 0;
const report = (ok, label, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  !!  '}${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) problems++;
};

const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 20000 }).connect();
const db = client.db('medication_identifier');

const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
console.log(`database: medication_identifier\ncollections: ${names.join(', ')}\n`);

// ── The two answer collections ────────────────────────────────────────────
for (const [collection, normalize, cacheable, hasFields] of [
  ['medications', normalizeDrugInfo, isCacheableDrugInfo, hasResultFields],
  ['professional_medications', normalizeProfessionalInfo, isCacheableProfessionalInfo, hasProfessionalFields],
]) {
  const docs = await db.collection(collection).find({}).toArray();
  console.log(`=== ${collection} — ${docs.length} documents ===`);

  const keyMismatch = [];
  const notNormalised = [];
  const stringData = [];
  const unservable = [];
  const misfiled = [];
  const willRefetch = [];
  const stale = [];
  const languages = new Map();

  for (const doc of docs) {
    // The key is how the document is found. One that does not match what
    // normalizeKey would produce can never be looked up again.
    if (doc._id !== normalizeKey(doc._id)) notNormalised.push(doc._id);
    if (doc.canonicalKey !== doc._id) keyMismatch.push(doc._id);
    if (typeof doc.data === 'string') stringData.push(doc._id);
    if (!doc.updatedAt || doc.updatedAt < staleBefore) stale.push(doc._id);
    languages.set(doc.language || '(missing)', (languages.get(doc.language || '(missing)') || 0) + 1);

    const normalized = normalize(doc.data);
    if (!cacheable(normalized)) unservable.push(doc._id);
    else if (!hasFields(normalized)) willRefetch.push(doc._id);

    /*
      Whether the document is the medicine it is filed as.

      This is the check that was missing, and the one that matters most. An
      answer filed under a name it does not describe is served to everybody who
      searches that name — the entry under "paracetamol" held Panadol's record,
      so searching "Abimol" returned a page headed "Panadol", and the entry
      under "fusidic acid" held fluocinolone acetonide's.

      Only the patient records carry an identity to check. A clinical record has
      no brand of its own and is keyed from the term that fetched it.
    */
    if (collection === 'medications' && cacheable(normalized)) {
      const belongsAt = storageKeyFor(normalized);
      if (belongsAt && belongsAt !== String(doc._id)) {
        misfiled.push(`${doc._id} holds ${belongsAt}`);
      }
    }
  }

  report(notNormalised.length === 0, 'every key is in the form lookups use',
    notNormalised.slice(0, 5).join(', '));
  report(keyMismatch.length === 0, 'canonicalKey agrees with _id on every document',
    keyMismatch.slice(0, 5).join(', '));
  report(unservable.length === 0, 'every document can be rendered',
    unservable.slice(0, 5).join(', '));
  report(misfiled.length === 0, 'every document is the medicine it is filed as',
    misfiled.slice(0, 6).join(', '));

  if (FIX && unservable.length > 0) {
    const { deletedCount } = await db.collection(collection).deleteMany({ _id: { $in: unservable } });
    console.log(`  fix   removed ${deletedCount} unservable document(s): ${unservable.join(', ')}`);
    // They were not being served anyway; the next lookup writes a good one.
    problems--;
  }

  if (FIX && misfiled.length > 0) {
    // The server already refuses to serve these, so removing them changes
    // nothing a person would see except the wrong answer going away. Each
    // costs one model call to rebuild, under the right name this time.
    const ids = misfiled.map((entry) => entry.slice(0, entry.indexOf(' holds ')));
    const { deletedCount } = await db.collection(collection).deleteMany({ _id: { $in: ids } });
    console.log(`  fix   removed ${deletedCount} misfiled document(s): ${ids.join(', ')}`);
    problems--;
  }
  // Not a fault: the code refetches these on first use rather than serving a
  // page of empty cards. Worth naming so the number is known.
  report(true, `${willRefetch.length} will be refetched on first use (written before the current fields)`,
    willRefetch.slice(0, 6).join(', '));
  report(true, `${stringData.length} store data as a JSON string rather than an object`,
    stringData.slice(0, 6).join(', '));
  report(true, `${stale.length} are past the ${MAX_AGE_DAYS}-day refresh window`,
    stale.slice(0, 5).join(', '));
  console.log(`  languages: ${[...languages].map(([k, v]) => `${k}=${v}`).join(', ')}\n`);
}

// ── The alias table ───────────────────────────────────────────────────────
{
  const aliases = await db.collection('medication_aliases').find({}).toArray();
  const answerKeys = new Set((await db.collection('medications')
    .find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
  const proKeys = new Set((await db.collection('professional_medications')
    .find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id));

  console.log(`=== medication_aliases — ${aliases.length} documents ===`);

  // A self-alias is dead weight: the term already finds its own entry.
  const selfAliases = aliases.filter((a) => a._id === a.canonicalKey).map((a) => a._id);
  // An alias pointing at nothing costs a second round trip and finds nothing.
  const orphans = aliases
    .filter((a) => !answerKeys.has(a.canonicalKey) && !proKeys.has(a.canonicalKey))
    .map((a) => `${a._id} -> ${a.canonicalKey}`);
  const noKey = aliases.filter((a) => !a.canonicalKey).map((a) => a._id);
  const noName = aliases.filter((a) => !a.resolvedName).map((a) => a._id);
  const notNormalised = aliases.filter((a) => a._id !== normalizeKey(a._id)).map((a) => a._id);
  /*
    A pointer nobody would write today.

    The shape this catches is one ingredient claiming to be a combination
    containing it: "calcium" pointed at a four-ingredient supplement, so
    everybody typing "calcium" was shown that supplement.
  */
  const unsafe = aliases
    .filter((a) => a.canonicalKey && a._id !== a.canonicalKey && !aliasIsSafe(a._id, a.canonicalKey))
    .map((a) => `${a._id} -> ${a.canonicalKey}`);

  /*
    A pointer to an answer that is not about the thing that was typed.

    The request path refuses an answer filed under a name it does not match, but
    a pointer is a second way to reach one, and it can be wrong on its own: the
    alias "rigix" pointed at the cetirizine record, which is the right
    ingredient under the wrong name — Rigix is a brand of it. "abimol" pointing
    at the paracetamol record was the same mistake, one step worse.

    A good pointer is a *spelling*, so the answer it reaches names something
    close to what was typed: "panadooll" reaches an answer that says Panadol,
    "flagel" reaches one that says Flagyl. Edit distance rather than equality,
    because a spelling that was already right would not need a pointer.
  */
  const answersByKey = new Map([
    // Clinical records first, so a patient record wins where both exist: it is
    // the one with a brand on it. A pointer reachable only from the clinical
    // collection still has to be checked, or it sits waiting to mis-route the
    // patient lookup the moment an answer appears under that key — which is
    // how "liptor" came to reach the generic atorvastatin record instead of
    // Lipitor's.
    ...(await db.collection('professional_medications').find({}).toArray()),
    ...(await db.collection('medications').find({}).toArray()),
  ].map((doc) => [String(doc._id), doc]));

  const editDistance = (a, b) => {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const current = [i];
      for (let j = 1; j <= b.length; j++) {
        current[j] = Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
      previous = current;
    }
    return previous[b.length];
  };

  // A clinical record carries no brand, only a generic name, so that is all
  // there is to compare a spelling against.
  const answerNames = (doc) => [
    doc?.data?.brandName, doc?.data?.drugName, doc?.data?.canonicalName, doc?.data?.genericName,
  ]
    .filter(Boolean)
    .flatMap((name) => normalizeKey(name).split(/[\s+]+/))
    .filter((word) => word.length >= 4);

  const strays = aliases
    .filter((a) => {
      const doc = answersByKey.get(a.canonicalKey);
      if (!doc) return false;            // already counted as an orphan
      const typed = normalizeKey(a._id);
      // Non-Latin spellings are a transliteration, not a misspelling, so edit
      // distance says nothing useful about them. They are left to the request
      // path, which refuses a mismatched answer anyway.
      if (!/^[a-z0-9 +]+$/.test(typed)) return false;
      return !answerNames(doc).some((word) => word.includes(typed)
        || typed.includes(word)
        || editDistance(typed, word) <= 2);
    })
    .map((a) => `${a._id} -> ${a.canonicalKey} (${answersByKey.get(a.canonicalKey)?.data?.drugName})`);

  report(notNormalised.length === 0, 'every alias key is in the form lookups use', notNormalised.slice(0, 5).join(', '));
  report(noKey.length === 0, 'every alias points at a canonical key', noKey.slice(0, 5).join(', '));
  report(selfAliases.length === 0, 'no alias points at itself', selfAliases.slice(0, 5).join(', '));
  report(orphans.length === 0, 'every alias resolves to an answer that exists', orphans.slice(0, 6).join(', '));
  report(unsafe.length === 0, 'no alias claims to be a medicine it is only part of', unsafe.slice(0, 6).join(', '));
  report(strays.length === 0, 'every alias reaches an answer that names what was typed',
    strays.slice(0, 6).join(', '));

  if (FIX) {
    // Pointers are derived data: deleting one costs the cheap resolution call
    // that created it, and nothing else. Wrong ones are served to everybody.
    const doomed = [
      ...selfAliases,
      ...orphans.map((entry) => entry.slice(0, entry.indexOf(' -> '))),
      ...unsafe.map((entry) => entry.slice(0, entry.indexOf(' -> '))),
      ...strays.map((entry) => entry.slice(0, entry.indexOf(' -> '))),
      ...noKey,
    ];
    if (doomed.length > 0) {
      const { deletedCount } = await db.collection('medication_aliases')
        .deleteMany({ _id: { $in: [...new Set(doomed)] } });
      console.log(`  fix   removed ${deletedCount} bad pointer(s)`);
      problems -= [selfAliases, orphans, unsafe, strays, noKey]
        .filter((list) => list.length > 0).length;
    }
  }
  // Only used by the type-ahead, so a missing one costs a suggestion, not a lookup.
  report(true, `${noName.length} carry no resolvedName, so they cannot be suggested`,
    noName.slice(0, 6).join(', '));
  console.log('');
}

// ── Rate limiting ─────────────────────────────────────────────────────────
{
  const coll = db.collection('rate_limits');
  const docs = await coll.find({}).toArray();
  const indexes = await coll.indexes();
  const ttl = indexes.find((i) => i.expireAfterSeconds !== undefined);

  console.log(`=== rate_limits — ${docs.length} documents ===`);
  // Without the TTL index these rows are immortal, and they are written once
  // per caller per window.
  report(Boolean(ttl), 'a TTL index is expiring old counters', ttl ? ttl.name : 'none found');
  const noExpiry = docs.filter((d) => !d.expiresAt).map((d) => d._id);
  report(noExpiry.length === 0, 'every counter has an expiry', noExpiry.slice(0, 5).join(', '));
  const expired = docs.filter((d) => d.expiresAt && d.expiresAt < new Date()).length;
  report(true, `${expired} are past their expiry and awaiting the TTL sweep`);
  console.log('');
}

// ── Anything the app does not know about ──────────────────────────────────
{
  const known = new Set(['medications', 'professional_medications', 'medication_aliases', 'rate_limits']);
  const unknown = names.filter((name) => !known.has(name));
  console.log('=== the database as a whole ===');
  report(unknown.length === 0, 'no collections the app does not use', unknown.join(', '));
}

await client.close();
console.log(problems ? `\n${problems} problem(s) found` : '\nnothing wrong found');
process.exit(problems ? 1 : 0);
