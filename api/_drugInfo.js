// api/_drugInfo.js — normalise, classify and validate drug information.
//
// Two jobs:
//
// 1. The model is asked for a fixed set of camelCase keys but does not always
//    comply; it has returned snake_case and reworded keys (drug_name,
//    common_uses, when_to_call_your_doctor...). The UI then reads undefined for
//    every field and crashes on .map(). So known aliases are mapped back on and
//    types are coerced.
//
// 2. The model will describe anything as if it were a medicine — a banana, a
//    pet, keyboard mash — inventing side effects for things that do not exist.
//    It must instead state what it actually recognised, so the app can refuse
//    to render a drug page for a non-drug and, just as importantly, refuse to
//    write one into the shared cache.

/** What the model decided the query actually is. */
const RECOGNITION = {
  MEDICATION: 'medication', // a real medicine — render the full drug page
  SUBSTANCE: 'substance', // real, but not a medicine (alcohol, cyanide, an illicit drug)
  UNKNOWN: 'unknown', // not recognised, or not a substance at all
};

const TEXT_FIELDS = [
  'drugName',
  // The generic ingredient name. Not shown to the user — it is what the cache
  // is keyed on, so every brand and spelling of the same medicine lands on one
  // entry instead of one per spelling. See api/_cacheKey.js.
  'canonicalName',
  'strength',
  'commonUse',
  'dosageAdministration',
  'foodDrinkEffect',
  'missedDose',
  'storage',
];

const LIST_FIELDS = ['commonSideEffects', 'seriousSideEffects', 'consultDoctorWhen'];

/** Alternative key names the model has been observed to produce. */
const ALIASES = {
  drugName: ['drug_name', 'name', 'medication_name', 'medicationName'],
  canonicalName: [
    'canonical_name', 'genericName', 'generic_name', 'activeIngredient',
    'active_ingredient', 'inn', 'ingredient',
  ],
  strength: ['dose', 'dosage_strength', 'strengths'],
  commonUse: ['common_use', 'common_uses', 'commonUses', 'what_it_is_for', 'uses', 'indication', 'indications'],
  dosageAdministration: ['dosage_administration', 'how_to_take_it', 'howToTake', 'dosage', 'administration'],
  foodDrinkEffect: ['food_drink_effect', 'food_and_drink', 'foodAndDrink', 'food_interactions', 'what_to_expect'],
  missedDose: ['missed_dose', 'if_you_miss_a_dose', 'missedDoseAdvice'],
  storage: ['storage_instructions', 'how_to_store', 'storageInstructions'],
  commonSideEffects: ['common_side_effects', 'sideEffects', 'side_effects'],
  seriousSideEffects: ['serious_side_effects', 'severe_side_effects', 'seriousSideEffectsList'],
  consultDoctorWhen: [
    'consult_doctor_when',
    'when_to_call_your_doctor',
    'when_to_contact_a_doctor',
    'when_to_see_a_doctor',
    'important_things_to_know',
    'warnings',
  ],
  recognition: ['recognised', 'recognized', 'result_type', 'resultType', 'classification', 'category'],
  identifiedAs: ['identified_as', 'actual_thing', 'whatItIs', 'what_it_is', 'explanation'],
  safetyNote: ['safety_note', 'safety_warning', 'warning', 'safetyWarning'],
};

const flatten = (value) => {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value === null || value === undefined) return [];
  if (typeof value === 'object') return Object.values(value).flatMap(flatten);
  return [String(value)];
};

const asText = (value) => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (Array.isArray(value) || typeof value === 'object') return flatten(value).join(' ');
  return String(value);
};

const asList = (value) => flatten(value).map((s) => s.trim()).filter(Boolean);

/** Case- and separator-insensitive key lookup, so DrugName == drug_name. */
const canonicalise = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

function pick(source, canonicalKey) {
  const wanted = [canonicalKey, ...(ALIASES[canonicalKey] || [])].map(canonicalise);
  for (const [key, value] of Object.entries(source)) {
    if (wanted.includes(canonicalise(key))) return value;
  }
  return undefined;
}

/** Maps whatever wording the model used into one of the three known states. */
function normalizeRecognition(raw) {
  const value = canonicalise(asText(raw));
  if (!value) return null;
  if (value.includes('medication') || value.includes('medicine') || value.includes('drug')) {
    return RECOGNITION.MEDICATION;
  }
  if (value.includes('substance') || value.includes('chemical') || value.includes('poison')) {
    return RECOGNITION.SUBSTANCE;
  }
  return RECOGNITION.UNKNOWN;
}

/** Enough populated fields that the drug page will render usefully. */
function looksLikeCompleteDrug(info) {
  if (!info || !info.drugName || !info.commonUse) return false;
  return LIST_FIELDS.filter((f) => (info[f] || []).length > 0).length >= 2;
}

/**
 * Entries written before canonicalName existed have none. They still render
 * fine, so they are served rather than discarded — but they cannot be grouped,
 * and generate.js falls back to the display name for their key.
 */
function hasCanonicalName(info) {
  return Boolean(info && info.canonicalName && info.canonicalName.trim());
}

/**
 * Coerces a model response into the exact shape the UI expects.
 * Always returns every key, so the UI can never read undefined.
 */
function normalizeDrugInfo(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const out = {};
  for (const field of TEXT_FIELDS) out[field] = asText(pick(raw, field));
  for (const field of LIST_FIELDS) out[field] = asList(pick(raw, field));

  out.identifiedAs = asText(pick(raw, 'identifiedAs'));
  out.safetyNote = asText(pick(raw, 'safetyNote'));

  // Entries cached before classification existed have no recognition field. If
  // such an entry still looks like a complete drug record, treat it as a
  // medication rather than forcing a pointless refetch.
  const stated = normalizeRecognition(pick(raw, 'recognition'));
  out.recognition = stated || (looksLikeCompleteDrug(out) ? RECOGNITION.MEDICATION : RECOGNITION.UNKNOWN);

  return out;
}

/**
 * True only for a confirmed medication with a complete record. A substance, an
 * unrecognised query, or a half-empty answer is still shown to the current user
 * but is never written to the shared cache — one bad entry would otherwise be
 * served to everyone for the next six months.
 */
function isCacheableDrugInfo(info) {
  if (!info) return false;
  if (info.recognition !== RECOGNITION.MEDICATION) return false;
  return looksLikeCompleteDrug(info);
}

/**
 * Gemini structured-output schema. Passing this makes the model return exactly
 * these keys with these types, instead of inventing its own naming and leaving
 * the UI with undefined fields.
 */
const DRUG_INFO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recognition: {
      type: 'STRING',
      enum: ['medication', 'substance', 'unknown'],
      description:
        'Classify the query. Use "medication" ONLY for a genuine medicine or drug product. ' +
        'Use "substance" for a real substance that is not a medicine, such as alcohol, ' +
        'cyanide or an illicit drug. Use "unknown" for anything else, including foods, ' +
        'objects, animals, people, nonsense text, and misspellings you cannot confidently ' +
        'resolve to a real medicine. When unsure, prefer "unknown" over guessing.',
    },
    identifiedAs: {
      type: 'STRING',
      description:
        'One short sentence saying what the query actually is, written for a patient. ' +
        'Required whenever recognition is not "medication", otherwise an empty string. ' +
        'Example: "A banana is a fruit, not a medicine."',
    },
    safetyNote: {
      type: 'STRING',
      description:
        'An urgent safety warning if the substance is dangerous, otherwise an empty string. ' +
        'Example: "Cyanide is extremely toxic. If someone has swallowed it, call emergency services immediately."',
    },
    drugName: {
      type: 'STRING',
      description: 'Name and strength, e.g. "Cetirizine 10mg". Empty string unless recognition is "medication".',
    },
    canonicalName: {
      type: 'STRING',
      description:
        'The generic (INN) active ingredient name, lowercase English, with NO brand name, ' +
        'NO strength, NO dosage form and NO punctuation. This is used to group every brand ' +
        'and spelling of the same medicine together, so it must be identical for every query ' +
        'that resolves to this medicine. Examples: "Panadol 500mg" -> "paracetamol"; ' +
        '"Lipitor" -> "atorvastatin"; "Brufen 400" -> "ibuprofen". For a combination product, ' +
        'list the ingredients joined by "+" in alphabetical order, e.g. ' +
        '"amoxicillin+clavulanic acid". Empty string unless recognition is "medication".',
    },
    strength: { type: 'STRING', description: 'Available strengths and forms' },
    commonUse: { type: 'STRING', description: 'What the medicine treats, in plain language' },
    dosageAdministration: { type: 'STRING', description: 'How and when to take it' },
    foodDrinkEffect: { type: 'STRING', description: 'Food, drink and alcohol interactions' },
    missedDose: { type: 'STRING', description: 'What to do after a missed dose' },
    commonSideEffects: { type: 'ARRAY', items: { type: 'STRING' }, description: 'At least three common side effects' },
    seriousSideEffects: { type: 'ARRAY', items: { type: 'STRING' }, description: 'At least three side effects needing urgent care' },
    consultDoctorWhen: { type: 'ARRAY', items: { type: 'STRING' }, description: 'At least three situations to contact a doctor' },
    storage: { type: 'STRING', description: 'How to store it' },
  },
  required: [
    'recognition', 'identifiedAs', 'safetyNote',
    'drugName', 'canonicalName', 'strength', 'commonUse', 'dosageAdministration', 'foodDrinkEffect',
    'missedDose', 'commonSideEffects', 'seriousSideEffects', 'consultDoctorWhen', 'storage',
  ],
  propertyOrdering: [
    'recognition', 'identifiedAs', 'safetyNote',
    'drugName', 'canonicalName', 'strength', 'commonUse', 'dosageAdministration', 'foodDrinkEffect',
    'missedDose', 'commonSideEffects', 'seriousSideEffects', 'consultDoctorWhen', 'storage',
  ],
};

module.exports = {
  normalizeDrugInfo,
  hasCanonicalName,
  isCacheableDrugInfo,
  looksLikeCompleteDrug,
  DRUG_INFO_SCHEMA,
  RECOGNITION,
  TEXT_FIELDS,
  LIST_FIELDS,
};
