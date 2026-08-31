// api/db.js — MongoDB connection helper.
//
// Caching is OPTIONAL. When MONGODB_URI is unset the app still works: every
// lookup goes straight to Gemini. This lets you run locally with nothing but a
// Gemini key. Previously this module threw at import time, which took the whole
// /api/generate function down whenever MONGODB_URI was missing.

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'medication_identifier';

const isCachingEnabled = Boolean(MONGODB_URI);

// Reuse the connection across warm serverless invocations.
let cached = global.__mongo;
if (!cached) {
  cached = global.__mongo = { conn: null, promise: null };
}

/**
 * Returns { db } when caching is configured and reachable, otherwise null.
 * Callers must treat null as "cache unavailable" and continue without it.
 */
async function connectToDatabase() {
  if (!isCachingEnabled) return null;
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    // Required lazily so a missing/broken driver cannot break the whole function.
    const { MongoClient } = require('mongodb');
    cached.promise = MongoClient.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    }).then((client) => ({ client, db: client.db(DB_NAME) }));
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    // Reset so a later invocation can retry rather than latching the failure.
    cached.promise = null;
    console.error('[db] connection failed, continuing without cache:', error.message);
    return null;
  }
}

/**
 * Closes the pooled connection. Serverless never needs this — the platform
 * reclaims the process — but tests do, otherwise the open socket keeps Node
 * alive and the runner never exits.
 */
async function closeDatabase() {
  if (cached.conn?.client) {
    await cached.conn.client.close();
  }
  cached.conn = null;
  cached.promise = null;
}

module.exports = { connectToDatabase, isCachingEnabled, closeDatabase };
