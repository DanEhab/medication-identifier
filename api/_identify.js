// api/_identify.js — what the model must return when it is shown a photo.
//
// Reading a pack used to return a bare string, which is all the old flow
// needed: it went straight from a photo to a full drug page. That skipped the
// question that matters most — "is this actually your box?" — so a misread
// label became a confident page about the wrong medicine.
//
// The answer is now structured, so the app can show what it read, say how sure
// it is, and offer the near neighbours it might have confused it with. The
// user confirms before anything is looked up.

/** How sure the model is that it read the right product. */
const CONFIDENCE = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

const IDENTIFY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recognised: {
      type: 'BOOLEAN',
      description:
        'True only if a medicine pack, blister strip or bottle label is legible in the image. ' +
        'False for anything else at all — a person, a pet, food, a hand, a blurred photo, ' +
        'or a medicine you cannot actually read.',
    },
    readAs: {
      type: 'STRING',
      description:
        'The product name exactly as printed on the pack, in the pack\'s own wording and case, ' +
        'e.g. "PANADOL EXTRA". Do not translate it and do not substitute the generic name. ' +
        'Empty string when recognised is false.',
    },
    strengthAndPack: {
      type: 'STRING',
      description:
        'Strength and pack size as printed, e.g. "500 mg / 65 mg · 24 tablets". ' +
        'Include only what is actually legible. Empty string if none of it can be read.',
    },
    confidence: {
      type: 'STRING',
      enum: ['high', 'medium', 'low'],
      description:
        'How confident you are that readAs is the product in the photo. Use "high" only when ' +
        'the name is clearly legible. Use "low" when you are largely guessing from packaging ' +
        'colour or shape.',
    },
    alternatives: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'The alternative product name.' },
          detail: { type: 'STRING', description: 'Its strength and pack size, e.g. "500 mg · 24 tablets".' },
        },
        required: ['name', 'detail'],
        propertyOrdering: ['name', 'detail'],
      },
      description:
        'Up to three other products this photo could plausibly be — normally other members of ' +
        'the same brand family, which is where real confusion happens. Empty array when you are ' +
        'certain, or when recognised is false.',
    },
  },
  required: ['recognised', 'readAs', 'strengthAndPack', 'confidence', 'alternatives'],
  propertyOrdering: ['recognised', 'readAs', 'strengthAndPack', 'confidence', 'alternatives'],
};

/** The phrase generate.js matches on to spot an image lookup. */
const IDENTIFY_MARKER = 'identify the drug name';

const isIdentifyPrompt = (promptText) =>
  typeof promptText === 'string' && promptText.toLowerCase().includes(IDENTIFY_MARKER);

const asText = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Coerces whatever the model returned into the exact shape the app reads, so a
 * missing or reworded field can never reach the UI as undefined.
 */
function normalizeIdentification(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const confidence = asText(raw.confidence).toLowerCase();
  const alternatives = Array.isArray(raw.alternatives) ? raw.alternatives : [];

  return {
    recognised: raw.recognised === true,
    readAs: asText(raw.readAs),
    strengthAndPack: asText(raw.strengthAndPack),
    confidence: Object.values(CONFIDENCE).includes(confidence) ? confidence : CONFIDENCE.LOW,
    alternatives: alternatives
      .map((item) => ({ name: asText(item?.name), detail: asText(item?.detail) }))
      .filter((item) => item.name)
      .slice(0, 3),
  };
}

module.exports = {
  IDENTIFY_SCHEMA,
  IDENTIFY_MARKER,
  isIdentifyPrompt,
  normalizeIdentification,
  CONFIDENCE,
};
