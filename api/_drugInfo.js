// api/_drugInfo.js — normalise and validate drug information from the model.
//
// The model is asked for a fixed set of camelCase keys but does not always
// comply; it sometimes returns snake_case or reworded keys (drug_name,
// common_uses, when_to_call_your_doctor...). The UI then reads undefined for
// every field and crashes on .map(), showing a blank screen.
//
// So: map known aliases onto the canonical keys, coerce types, and refuse to
// cache anything that still does not fit — one bad generation must not be
// served to every user for the next six months.

const TEXT_FIELDS = [
  'drugName',
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

const asList = (value) => {
  const items = flatten(value).map((s) => s.trim()).filter(Boolean);
  return items;
};

/** Case- and separator-insensitive key lookup, so DrugName == drug_name. */
const canonicalise = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

function pick(source, canonicalKey) {
  const wanted = [canonicalKey, ...(ALIASES[canonicalKey] || [])].map(canonicalise);
  for (const [key, value] of Object.entries(source)) {
    if (wanted.includes(canonicalise(key))) return value;
  }
  return undefined;
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
  return out;
}

/**
 * True when the normalised result is complete enough to be worth caching.
 * A partially-empty answer is still shown to the current user, but is not
 * stored, so the next request gets a fresh attempt.
 */
function isCacheableDrugInfo(info) {
  if (!info) return false;
  if (!info.drugName || !info.commonUse) return false;
  const filledLists = LIST_FIELDS.filter((f) => info[f].length > 0).length;
  return filledLists >= 2;
}

module.exports = { normalizeDrugInfo, isCacheableDrugInfo, TEXT_FIELDS, LIST_FIELDS };
