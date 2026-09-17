// api/_cache.js — the shared answer cache.
//
// Two collections hold answers, one per audience:
//
//   medications               patient-facing answers
//   professional_medications  clinical answers
//
// Both are keyed by the *storage* key — the product the model named — so one
// medicine is one document however it was spelled, and two medicines are never
// one document because they share an ingredient. A third collection maps
// search terms onto those keys:
//
//   medication_aliases        _id: "panadooll"  ->  canonicalKey: "paracetamol"
//
// An alias is roughly 120 bytes against roughly 2.5 KB for an answer, and it
// costs nothing to create because it is written alongside an answer that was
// being generated anyway.

const { queryKeyFor, storageKeyFor, aliasIsSafe } = require('./_cacheKey');

const ALIAS_COLLECTION = 'medication_aliases';

// Answers are reused for this long, then refetched so revised dosing, warnings
// or interactions eventually make it through. Override with CACHE_MAX_AGE_DAYS.
const cacheMaxAgeMs = () => Number(process.env.CACHE_MAX_AGE_DAYS || 180) * 24 * 60 * 60 * 1000;

let indexesReady = false;

/**
 * Created once per warm instance. Failure is not fatal: the collections are
 * queried by _id, which is always indexed, so this only adds the secondary
 * index used for maintenance and reporting.
 */
async function ensureIndexes(db) {
  if (indexesReady) return;
  try {
    await db.collection(ALIAS_COLLECTION).createIndex({ canonicalKey: 1 });
    indexesReady = true;
  } catch (error) {
    console.warn('[cache] could not create the alias index:', error.message);
  }
}

/**
 * Finds a cached answer for a search term.
 *
 * The direct lookup and the alias lookup are issued together, so the common
 * case — someone typing the drug's actual name — costs one round trip and only
 * a genuine typo costs two.
 *
 * Returns { doc, canonicalKey, via } where `via` is 'direct', 'alias' or null.
 * `canonicalKey` is always set, so the caller can write the answer back under
 * the right key even when nothing was found.
 */
async function findCachedAnswer(db, collectionName, searchTerm) {
  const queryKey = queryKeyFor(searchTerm);
  if (!queryKey) return { doc: null, queryKey, canonicalKey: null, via: null };

  const fresherThan = new Date(Date.now() - cacheMaxAgeMs());

  const [direct, alias] = await Promise.all([
    // The term may already be the canonical name.
    db.collection(collectionName).findOne({ _id: queryKey, updatedAt: { $gte: fresherThan } }),
    db.collection(ALIAS_COLLECTION).findOne({ _id: queryKey }),
  ]);

  if (direct) {
    return { doc: direct, queryKey, canonicalKey: queryKey, via: 'direct' };
  }

  if (alias?.canonicalKey) {
    const doc = await db
      .collection(collectionName)
      .findOne({ _id: alias.canonicalKey, updatedAt: { $gte: fresherThan } });
    // A known alias with no fresh answer is still worth returning: it tells the
    // caller which key to write the refreshed answer under.
    return { doc: doc || null, queryKey, canonicalKey: alias.canonicalKey, via: doc ? 'alias' : null };
  }

  return { doc: null, queryKey, canonicalKey: null, via: null };
}

/** Looks up an answer by a canonical key that has already been resolved. */
async function findByCanonicalKey(db, collectionName, canonicalKey) {
  if (!canonicalKey) return null;
  const fresherThan = new Date(Date.now() - cacheMaxAgeMs());
  return db.collection(collectionName).findOne({ _id: canonicalKey, updatedAt: { $gte: fresherThan } });
}

/**
 * Records that a search term means a particular medicine, without touching the
 * answer itself. Used when a cheap resolution turned a miss into a hit: the
 * answer was already there, only the pointer to it was missing.
 */
async function saveAlias(db, queryKey, canonicalKey, resolvedName) {
  if (!aliasIsSafe(queryKey, canonicalKey)) return;
  await ensureIndexes(db);
  const now = new Date();

  // resolvedName is only ever written when there is one. A professional lookup
  // has no drug record of its own, and used to blank the name a patient lookup
  // had already recorded on the same pointer.
  const fields = { canonicalKey, updatedAt: now };
  if (resolvedName) fields.resolvedName = resolvedName;

  await db.collection(ALIAS_COLLECTION).updateOne(
    { _id: queryKey },
    { $set: fields, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );
}

/**
 * Stores an answer under its canonical key and points the search term at it.
 *
 * `drugInfo` is the normalised patient record, and it decides the key. The
 * resolution step's answer is only a fallback, for a professional record that
 * has no identity of its own to key on.
 *
 * That order matters and used to be the other way round. Preferring the
 * resolved key meant an answer could be filed under a name it did not match,
 * because the key came from one model call and the contents from another. The
 * record is the thing being stored, so the record decides where it goes.
 */
async function saveCachedAnswer(db, collectionName, { queryKey, canonicalKey, data, drugInfo }) {
  const key = storageKeyFor(drugInfo) || canonicalKey || queryKey;
  if (!key) return null;

  await ensureIndexes(db);

  const now = new Date();
  await db.collection(collectionName).updateOne(
    { _id: key },
    {
      $set: {
        canonicalKey: key,
        language: 'en',
        data,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  // Only a term that differs from the key needs an alias, and only one that is
  // genuinely a name for the same product. saveAlias decides both.
  await saveAlias(db, queryKey, key, drugInfo?.drugName);

  return key;
}

module.exports = { findCachedAnswer, findByCanonicalKey, saveAlias, saveCachedAnswer, ALIAS_COLLECTION };
