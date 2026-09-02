// api/generate.js — Gemini proxy with optional MongoDB caching.
//
// The Gemini key lives only here, server-side. Clients never see it.

const { connectToDatabase } = require('./db');
const { applyCors } = require('./_cors');
const { normalizeDrugInfo, isCacheableDrugInfo } = require('./_drugInfo');

const GEMINI_MODEL = 'gemini-2.5-flash';

// Cached drug information is reused for this long, then refetched so that
// revised dosing, warnings or interactions eventually make it through.
// Override with CACHE_MAX_AGE_DAYS.
const CACHE_MAX_AGE_DAYS = Number(process.env.CACHE_MAX_AGE_DAYS || 180);
const CACHE_MAX_AGE_MS = CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
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

const normalizeDrugName = (drugName) => (drugName ? drugName.toLowerCase().trim() : null);

/** Patient-facing and professional answers are cached separately. */
const getCollectionName = (prompt) => {
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('healthcare professional') || lowerPrompt.includes('professional') || lowerPrompt.includes('technical')) {
    return 'professional_medications';
  }
  return 'medications';
};

const callGeminiAPI = async (formattedContents, config) => {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Header auth keeps the key out of URLs and therefore out of access logs.
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify({ contents: formattedContents, generationConfig: config || {} }),
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
    const normalizedName = normalizeDrugName(extractDrugName(promptText));
    const collectionName = getCollectionName(promptText);

    // Image identification results are never cached — only named drug lookups.
    const isCacheable =
      Boolean(normalizedName) && !promptText.toLowerCase().includes('identify the drug name');

    if (isCacheable) {
      const connection = await connectToDatabase();
      if (connection) {
        try {
          const fresherThan = new Date(Date.now() - CACHE_MAX_AGE_MS);
          const cached = await connection.db.collection(collectionName).findOne({
            normalizedName,
            language: 'en',
            // Entries written before expiry existed have no updatedAt, so they
            // fail this check and get refreshed on next lookup.
            updatedAt: { $gte: fresherThan },
          });

          if (cached) {
            const payload = servableCachedPayload(cached, collectionName);
            if (payload) {
              console.log(`[cache HIT] ${normalizedName} in ${collectionName}`);
              return res.status(200).json({ text: payload, cached: true });
            }
            // Stored before validation existed, or the model had returned keys
            // the UI cannot read. Treat as a miss so it is refetched and fixed.
            console.log(`[cache STALE-SHAPE] ${normalizedName} in ${collectionName}`);
          }
          console.log(`[cache MISS] ${normalizedName} in ${collectionName}`);
        } catch (dbError) {
          console.error('[generate] cache read failed, continuing:', dbError.message);
        }
      }
    }

    // Always generated in English; the client translates for display.
    const rawText = await callGeminiAPI(formattedContents, config);

    // Normalise the patient view before anyone sees it. The model does not
    // reliably honour the requested key names, and the UI maps over the list
    // fields — an unexpected shape used to unmount the app to a blank screen.
    // Normalising here also means the first caller and every later caller get
    // byte-identical text.
    let text = rawText;
    let cacheableData = null;

    if (collectionName === 'medications') {
      try {
        const normalized = normalizeDrugInfo(JSON.parse(extractJSON(rawText)));
        if (normalized) {
          text = JSON.stringify(normalized);
          if (isCacheableDrugInfo(normalized)) {
            cacheableData = normalized;
          } else {
            console.warn(`[shape] ${normalizedName} — incomplete answer, serving but not caching`);
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
          await connection.db.collection(collectionName).updateOne(
            { normalizedName, language: 'en' },
            {
              $set: {
                normalizedName,
                language: 'en',
                data: cacheableData,
                updatedAt: new Date(),
              },
              $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true },
          );
          console.log(`[cache SAVE] ${normalizedName} to ${collectionName}`);
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
