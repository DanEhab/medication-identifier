// api/suggest.js — type-ahead for the search screen.
//
// The suggestions are medicines the app has already answered for, read out of
// the same cache /api/generate writes. That matters for two reasons: they are
// real names with real strengths rather than a list invented by a model, and
// answering one costs a single indexed lookup and no Gemini call at all.
//
// The list therefore starts empty on a brand new deployment and fills in as
// the app is used. The search screen never depends on it: typing a name that
// has never been looked up still works exactly as before.

const { connectToDatabase } = require('./db');
const { applyCors } = require('./_cors');
const { checkRequestLimit, rejectRateLimited } = require('./_rateLimit');
const { queryKeyFor, normalizeKey } = require('./_cacheKey');

const ANSWER_COLLECTION = 'medications';
const ALIAS_COLLECTION = 'medication_aliases';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;
/** Read a few more than are returned, because merging drops duplicates. */
const SCAN_LIMIT = 24;

/** Everything a regex could read as syntax, so a typed "+" cannot break out. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A medicine's own name, preferred over the key.
 *
 * The key is normalised for matching — lower case, no punctuation — so showing
 * it raw would offer "panadol extra" where the pack says "Panadol Extra".
 */
function displayName(doc) {
  const data = doc?.data || {};
  return (
    (data.brandName && data.brandName.trim()) ||
    (data.drugName && data.drugName.trim()) ||
    (data.canonicalName && data.canonicalName.trim()) ||
    String(doc?._id || '')
  );
}

/** The line under the name: what it is, in the app's own words. */
function detailFor(doc) {
  const data = doc?.data || {};
  const parts = [];

  const generic = (data.canonicalName || '').trim();
  const brand = (data.brandName || '').trim();
  if (generic && generic.toLowerCase() !== brand.toLowerCase()) parts.push(generic);

  const strength = (data.strength || '').trim();
  if (strength) parts.push(strength);

  return parts.join(' · ');
}

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = req.method === 'GET' ? req.query?.q : req.body?.q;
  const typed = typeof raw === 'string' ? raw.trim() : '';

  // Below two characters every medicine in the cache matches, which is not a
  // suggestion, it is a directory.
  if (typed.length < MIN_QUERY_LENGTH) return res.status(200).json({ suggestions: [] });

  // Its own bucket: a keystroke is far cheaper than an answer, so it must not
  // spend the budget that protects Gemini.
  const limit = await checkRequestLimit(req, 'suggest');
  if (!limit.allowed) return rejectRateLimited(res, limit);

  try {
    const connection = await connectToDatabase();
    // No cache configured means no suggestions, never an error: the screen
    // treats an empty list and a failed request the same way.
    if (!connection) return res.status(200).json({ suggestions: [] });

    const { db } = connection;
    // Match the way keys were written, or "panadol e" would never find
    // "panadol extra".
    const prefix = new RegExp('^' + escapeRegex(normalizeKey(typed)));

    const [answers, aliases] = await Promise.all([
      db.collection(ANSWER_COLLECTION).find({ _id: prefix }).limit(SCAN_LIMIT).toArray(),
      // An alias is what somebody actually typed, so it catches brand names
      // that resolved to a generic and are not keys of their own.
      db.collection(ALIAS_COLLECTION).find({ _id: prefix, resolvedName: { $exists: true } })
        .limit(SCAN_LIMIT).toArray(),
    ]);

    const seen = new Set();
    const suggestions = [];

    const add = (name, detail) => {
      const cleaned = (name || '').trim();
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      suggestions.push({ name: cleaned, detail: detail || '' });
    };

    for (const doc of answers) add(displayName(doc), detailFor(doc));
    for (const alias of aliases) add(alias.resolvedName, '');

    // Shortest first: a prefix match on a short name is far more likely to be
    // what someone half way through typing meant.
    suggestions.sort((a, b) => a.name.length - b.name.length);

    return res.status(200).json({ suggestions: suggestions.slice(0, MAX_RESULTS) });
  } catch (error) {
    console.error('[suggest] lookup failed:', error.message);
    // A broken type-ahead must never stop somebody searching.
    return res.status(200).json({ suggestions: [] });
  }
};

module.exports.MIN_QUERY_LENGTH = MIN_QUERY_LENGTH;
module.exports.MAX_RESULTS = MAX_RESULTS;
