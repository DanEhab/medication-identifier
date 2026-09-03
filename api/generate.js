// api/generate.js — Gemini proxy with optional MongoDB caching.
//
// The Gemini key lives only here, server-side. Clients never see it.

const { connectToDatabase } = require('./db');
const { applyCors } = require('./_cors');
const { normalizeDrugInfo, isCacheableDrugInfo, DRUG_INFO_SCHEMA } = require('./_drugInfo');
const { checkRequestLimit, checkDailyBudget, rejectRateLimited } = require('./_rateLimit');
const { findCachedAnswer, findByCanonicalKey, saveCachedAnswer, saveAlias } = require('./_cache');
const { queryKeyFor } = require('./_cacheKey');

const GEMINI_MODEL = 'gemini-2.5-flash';

const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024; // Gemini caps inline image data well below this.

/** Pulls a JSON object out of a response that may be wrapped in markdown fences. */
const extractJSON = (text) => {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

  const startIndex = cleaned.indexOf('{');
  if (startIndex === -1) return cleaned;

  let braceCount = 0;
  for (let i = startIndex; i < cleaned.length; i++) {
    if (cleaned[i] === '{') braceCount++;
    else if (cleaned[i] === '}') {
      braceCount--;
      if (braceCount === 0) return cleaned.substring(startIndex, i + 1);
    }
  }

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : cleaned;
};

const extractDrugName = (prompt) => {
  const match = prompt.match(/(?:drug|medication):\s*([^.,\n]+)/i);
  return match ? match[1].trim() : null;
};

/** Patient-facing and professional answers are cached separately. */
const getCollectionName = (prompt) => {
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('healthcare professional') || lowerPrompt.includes('professional') || lowerPrompt.includes('technical')) {
    return 'professional_medications';
  }
  return 'medications';
};

const callGeminiAPI = async (formattedContents, config, schema) => {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  // A schema makes the model return exactly the keys the UI reads. Without it
  // it drifts into snake_case or drops fields entirely.
  const generationConfig = { ...(config || {}) };
  if (schema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = schema;
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Header auth keeps the key out of URLs and therefore out of access logs.
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({ contents: formattedContents, generationConfig }),
  });

  const data = await response.json();

  if (!response.ok) {
    // Log detail server-side; never return provider internals to the client.
    console.error('[generate] Gemini error:', response.status, JSON.stringify(data));
    const error = new Error('The medication service is temporarily unavailable. Please try again.');
    error.statusCode = response.status === 429 ? 429 : 502;
    if (response.status === 429) {
      error.message = 'Too many requests right now. Please wait a moment and try again.';
    }
    throw error;
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error('[generate] Unexpected Gemini response shape:', JSON.stringify(data));
    throw Object.assign(new Error('Received an unreadable response. Please try again.'), { statusCode: 502 });
  }

  return text;
};

/**
 * Asks the model one question: what is this term's generic ingredient?
 *
 * An alias only helps once a spelling has been seen before, so without this a
 * brand-new misspelling of an already-cached medicine would still pay for a
 * full answer. This call returns a handful of tokens instead of the ~800 a full
 * answer costs — roughly 2% of the price — and usually turns that miss into a
 * hit on an entry that is already there.
 */
const RESOLVE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    canonicalName: {
      type: 'STRING',
      description:
        'The generic (INN) active ingredient for this search term, lowercase English, ' +
        'no brand, no strength, no dosage form. "Panadol 500mg" -> "paracetamol". ' +
        '"Lipitor" -> "atorvastatin". Combinations join ingredients with "+" in ' +
        'alphabetical order. Empty string if this is not a medicine, or if you cannot ' +
        'confidently resolve it — never guess.',
    },
  },
  required: ['canonicalName'],
};

const resolveCanonicalKey = async (searchTerm) => {
  try {
    const text = await callGeminiAPI(
      [{ parts: [{ text: `What is the generic active ingredient of the medicine: ${searchTerm}` }] }],
      { temperature: 0, maxOutputTokens: 200 },
      RESOLVE_SCHEMA,
    );
    const parsed = JSON.parse(extractJSON(text));
    return queryKeyFor(parsed?.canonicalName) || null;
  } catch (error) {
    // Never fatal. A failed resolution simply means the full answer is
    // generated, which is exactly what used to happen every time.
    console.warn('[resolve] could not resolve a canonical name:', error.message);
    return null;
  }
};

/** Normalises the several shapes the client may send into Gemini's `contents`. */
const normalizeContents = (contents) => {
  if (typeof contents === 'string') {
    return { formattedContents: [{ parts: [{ text: contents }] }], promptText: contents };
  }
  if (Array.isArray(contents)) {
    const textPart = contents[0]?.parts?.find((part) => part.text);
    return { formattedContents: contents, promptText: textPart?.text || '' };
  }
  const textPart = contents?.parts?.find((part) => part.text);
  return { formattedContents: [contents], promptText: textPart?.text || '' };
};

/**
 * Returns the JSON text to serve for a cached document, or null when the
 * stored shape is not something the UI can render.
 */
const servableCachedPayload = (cached, collectionName) => {
  const data = cached.data;
  if (collectionName !== 'medications') {
    return typeof data === 'object' ? JSON.stringify(data) : data;
  }
  const normalized = normalizeDrugInfo(data);
  if (!isCacheableDrugInfo(normalized)) return null;
  return JSON.stringify(normalized);
};

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('[generate] GEMINI_API_KEY is not configured');
    return res.status(500).json({ error: 'Server is not configured. Please try again later.' });
  }

  // Stops one caller flooding the endpoint. Checked before any work is done.
  const callerLimit = await checkRequestLimit(req);
  if (!callerLimit.allowed) {
    console.warn('[generate] caller rate limit hit');
    return rejectRateLimited(res, callerLimit);
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    return res.status(413).json({ error: 'Image is too large. Please use a smaller photo.' });
  }

  try {
    const { contents, config } = req.body || {};
    if (!contents) {
      return res.status(400).json({ error: 'Request is missing content.' });
    }

    const { formattedContents, promptText } = normalizeContents(contents);
    const searchTerm = extractDrugName(promptText);
    const collectionName = getCollectionName(promptText);

    // Image identification results are never cached — only named drug lookups.
    const isCacheable =
      Boolean(searchTerm) && !promptText.toLowerCase().includes('identify the drug name');

    // Set by the cache read so the write can reuse it. When a search term is a
    // known typo, its canonical key is already known before Gemini is called,
    // and a professional answer has no canonicalName of its own to derive one
    // from — so this is how it gets grouped with the patient-facing entry.
    let queryKey = null;
    let knownCanonicalKey = null;

    if (isCacheable) {
      const connection = await connectToDatabase();
      if (connection) {
        try {
          const found = await findCachedAnswer(connection.db, collectionName, searchTerm);
          queryKey = found.queryKey;
          knownCanonicalKey = found.canonicalKey;

          if (found.doc) {
            const payload = servableCachedPayload(found.doc, collectionName);
            if (payload) {
              console.log(
                `[cache HIT via ${found.via}] "${queryKey}" -> "${found.canonicalKey}" in ${collectionName}`,
              );
              return res.status(200).json({ text: payload, cached: true });
            }
            // Stored before validation existed, or the model had returned keys
            // the UI cannot read. Treat as a miss so it is refetched and fixed.
            console.log(`[cache STALE-SHAPE] "${found.canonicalKey}" in ${collectionName}`);
          }
          console.log(`[cache MISS] "${queryKey}" in ${collectionName}`);
        } catch (dbError) {
          console.error('[generate] cache read failed, continuing:', dbError.message);
        }
      }
    }

    // Past the cache, so this request is about to cost money. The daily cap is
    // checked here rather than at the top, because cache hits are free and must
    // not eat into the budget.
    const budget = await checkDailyBudget();
    if (!budget.allowed) {
      console.warn('[generate] daily budget reached');
      return rejectRateLimited(res, budget);
    }

    // A spelling nobody has used before has no alias yet, so the lookup above
    // missed even when the medicine itself is already cached. Resolving the
    // ingredient first costs a few tokens and usually finds it.
    if (isCacheable && queryKey && !knownCanonicalKey) {
      const connection = await connectToDatabase();
      if (connection) {
        try {
          const resolvedKey = await resolveCanonicalKey(searchTerm);
          if (resolvedKey && resolvedKey !== queryKey) {
            knownCanonicalKey = resolvedKey;
            const doc = await findByCanonicalKey(connection.db, collectionName, resolvedKey);
            if (doc) {
              const payload = servableCachedPayload(doc, collectionName);
              if (payload) {
                // Remember the spelling so the next person typing it skips
                // even this step.
                await saveAlias(connection.db, queryKey, resolvedKey, doc.data?.drugName);
                console.log(
                  `[cache HIT via resolve] "${queryKey}" -> "${resolvedKey}" in ${collectionName}`,
                );
                return res.status(200).json({ text: payload, cached: true });
              }
            }
            console.log(`[resolve] "${queryKey}" -> "${resolvedKey}" (not cached yet)`);
          }
        } catch (resolveError) {
          console.warn('[generate] resolution step failed, continuing:', resolveError.message);
        }
      }
    }

    // Always generated in English; the client translates for display.
    const rawText = await callGeminiAPI(
      formattedContents,
      config,
      collectionName === 'medications' && isCacheable ? DRUG_INFO_SCHEMA : undefined,
    );

    // Normalise the patient view before anyone sees it. The model does not
    // reliably honour the requested key names, and the UI maps over the list
    // fields — an unexpected shape used to unmount the app to a blank screen.
    // Normalising here also means the first caller and every later caller get
    // byte-identical text.
    let text = rawText;
    let cacheableData = null;
    let drugInfo = null;

    if (collectionName === 'medications') {
      try {
        const normalized = normalizeDrugInfo(JSON.parse(extractJSON(rawText)));
        if (normalized) {
          text = JSON.stringify(normalized);
          drugInfo = normalized;
          if (isCacheableDrugInfo(normalized)) {
            cacheableData = normalized;
          } else {
            console.warn(`[shape] "${queryKey}" — incomplete answer, serving but not caching`);
          }
        }
      } catch (parseError) {
        console.error('[generate] could not parse model response:', parseError.message);
      }
    } else {
      try {
        cacheableData = JSON.parse(extractJSON(rawText));
      } catch {
        cacheableData = rawText;
      }
    }

    if (isCacheable && cacheableData) {
      const connection = await connectToDatabase();
      if (connection) {
        try {
          // A patient answer keys itself from the ingredient the model named.
          // A professional answer has no such field, so it reuses the key the
          // alias table already holds and otherwise falls back to the term.
          const savedUnder = await saveCachedAnswer(connection.db, collectionName, {
            queryKey,
            canonicalKey: knownCanonicalKey,
            data: cacheableData,
            drugInfo,
          });
          console.log(
            savedUnder && savedUnder !== queryKey
              ? `[cache SAVE] "${queryKey}" -> "${savedUnder}" in ${collectionName}`
              : `[cache SAVE] "${savedUnder}" in ${collectionName}`,
          );
        } catch (dbError) {
          console.error('[generate] cache write failed, continuing:', dbError.message);
        }
      }
    }

    return res.status(200).json({ text, cached: false });
  } catch (error) {
    console.error('[generate] request failed:', error);
    return res
      .status(error.statusCode || 500)
      .json({ error: error.statusCode ? error.message : 'Something went wrong. Please try again.' });
  }
};
