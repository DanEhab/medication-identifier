// api/_rateLimit.js — protects the Gemini budget from floods and runaway use.
//
// Two separate limits, because they defend against different things:
//
//   Per-caller, per-minute  — stops one script hammering the endpoint. Counts
//                             every request, cached or not.
//   Whole-app, per-day      — caps what a bad day can actually cost. Counts
//                             only requests that reach Gemini, since a cache
//                             hit costs nothing.
//
// Counters live in MongoDB rather than in memory: serverless instances each
// keep their own memory, so an in-memory counter is trivially walked past by
// spreading requests across instances. The database is in the same region as
// the functions, so this adds a couple of milliseconds.
//
// Every failure path here allows the request. A rate limiter that breaks must
// never take the app down with it.

const crypto = require('crypto');
const { connectToDatabase } = require('./db');

const COLLECTION = 'rate_limits';

/**
 * Per-minute allowances, per caller, per endpoint.
 *
 * They are separate buckets because the endpoints cost wildly different
 * amounts. A lookup calls Gemini and costs real money. Translation calls a
 * free service — but an Arabic page fires roughly ten of them at once, so a
 * shared bucket would lock a normal reader out after two searches.
 */
const LIMITS = {
  generate: Number(process.env.RATE_LIMIT_GENERATE_PER_MINUTE || 20),
  translate: Number(process.env.RATE_LIMIT_TRANSLATE_PER_MINUTE || 150),
};

/** Kept for callers that do not name a bucket. */
const PER_IP_PER_MINUTE = LIMITS.generate;

/** The real budget guard. Only counts requests that actually cost money. */
const GLOBAL_PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY || 2000);

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

let indexReady = false;

/**
 * Identifies the caller without storing anything identifying. Raw addresses are
 * personal data, and this is a medical app — a salted hash is enough to count
 * requests and useless for anything else.
 */
function callerKey(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded?.[0]) ||
    req.headers?.['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown';

  const salt = process.env.RATE_LIMIT_SALT || 'medication-identifier';
  return crypto.createHash('sha256').update(`${salt}:${String(ip).trim()}`).digest('hex').slice(0, 32);
}

/** TTL index so spent counters clean themselves up. Created once per instance. */
async function ensureIndex(db) {
  if (indexReady) return;
  try {
    await db.collection(COLLECTION).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    indexReady = true;
  } catch (error) {
    // Not fatal — documents simply linger until the next successful attempt.
    console.warn('[rateLimit] could not create the TTL index:', error.message);
  }
}

/**
 * Atomically increments a counter for the current window and returns its value.
 * The window start is part of the document id, so a new window is a new
 * document and there is no reset step to race against.
 */
async function bump(db, prefix, key, windowMs) {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const id = `${prefix}:${key}:${windowStart}`;

  const result = await db.collection(COLLECTION).findOneAndUpdate(
    { _id: id },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(windowStart + windowMs * 2) },
    },
    { upsert: true, returnDocument: 'after' },
  );

  const doc = result?.value ?? result;
  return {
    count: doc?.count ?? 1,
    resetAt: windowStart + windowMs,
  };
}

/**
 * Checks the per-caller limit. Returns { allowed, retryAfterSeconds }.
 * Allows the request if the database is unavailable.
 */
async function checkRequestLimit(req, bucket = 'generate') {
  const connection = await connectToDatabase();
  if (!connection) return { allowed: true, limited: false };

  const allowance = LIMITS[bucket] ?? LIMITS.generate;

  try {
    await ensureIndex(connection.db);
    const { count, resetAt } = await bump(connection.db, `ip:${bucket}`, callerKey(req), MINUTE_MS);

    if (count > allowance) {
      return {
        allowed: false,
        limited: true,
        scope: 'caller',
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
      };
    }
    return { allowed: true, limited: false, remaining: allowance - count };
  } catch (error) {
    console.error('[rateLimit] caller check failed, allowing the request:', error.message);
    return { allowed: true, limited: false };
  }
}

/**
 * Checks and increments the whole-app daily budget. Call this only when a
 * request is about to reach Gemini — cache hits are free and must not count.
 */
async function checkDailyBudget() {
  const connection = await connectToDatabase();
  if (!connection) return { allowed: true, limited: false };

  try {
    await ensureIndex(connection.db);
    const { count, resetAt } = await bump(connection.db, 'global', 'gemini', DAY_MS);

    if (count > GLOBAL_PER_DAY) {
      return {
        allowed: false,
        limited: true,
        scope: 'daily',
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
      };
    }
    return { allowed: true, limited: false, remaining: GLOBAL_PER_DAY - count };
  } catch (error) {
    console.error('[rateLimit] budget check failed, allowing the request:', error.message);
    return { allowed: true, limited: false };
  }
}

/**
 * Writes the 429 response. The message is meant to be shown to a real person
 * who has simply searched a lot in one minute, not to an attacker.
 */
function rejectRateLimited(res, result) {
  const seconds = result.retryAfterSeconds || 60;
  res.setHeader('Retry-After', String(seconds));

  const message =
    result.scope === 'daily'
      ? 'The app has reached its daily limit of new medication lookups. Medicines you have already searched still work, and normal service resumes tomorrow.'
      : 'You have made a lot of searches in a short time. Please wait a moment and try again.';

  return res.status(429).json({ error: message, retryAfter: seconds, scope: result.scope });
}

module.exports = {
  checkRequestLimit,
  checkDailyBudget,
  rejectRateLimited,
  callerKey,
  PER_IP_PER_MINUTE,
  LIMITS,
  GLOBAL_PER_DAY,
};
