// api/_cors.js — shared CORS + preflight handling.
// Files prefixed with `_` are helpers, not routes, on Vercel.

// Comma-separated allowlist, e.g. "https://example.com,https://www.example.com".
// Left empty the API stays open, which is only appropriate in local development.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// The Android build runs from the Capacitor webview, which sends these origins.
const CAPACITOR_ORIGINS = ['capacitor://localhost', 'http://localhost', 'https://localhost'];

function resolveOrigin(requestOrigin) {
  if (ALLOWED_ORIGINS.length === 0) return '*';
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  const allowed = [...ALLOWED_ORIGINS, ...CAPACITOR_ORIGINS];
  return allowed.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
}

/**
 * Applies CORS headers. Returns true when the request was a preflight and has
 * already been answered — callers should return immediately in that case.
 */
function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', resolveOrigin(req.headers?.origin));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { applyCors };
