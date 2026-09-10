// api/_professional.js — the clinician's view of the same drug.
//
// The patient answer has had a response schema and a normaliser since the
// caching work; this one had neither. It was parsed straight out of whatever
// the model returned, with fields typed `any` that could arrive as a string, an
// array or a nested object, and a JSON.parse that threw the whole request away
// when the model wrapped its answer differently. Same treatment as the patient
// record: pin the keys, flatten the shapes, guarantee what the screen renders.

const TEXT_FIELDS = [
  'genericName',
  'atcCode',
  'formAndStrength',
  'drugClass',
  'mechanism',
  'pharmacokinetics',
  'contraindications',
  'monitoring',
];

const LIST_FIELDS = ['majorInteractions'];

/** Names the model has been seen to use for the ones asked for. */
const ALIASES = {
  genericName: ['generic_name', 'inn', 'activeIngredient', 'active_ingredient', 'drugName', 'drug_name'],
  atcCode: ['atc_code', 'atc', 'atcClassification', 'atc_classification'],
  formAndStrength: ['form_and_strength', 'formStrength', 'form', 'strength', 'presentation'],
  drugClass: ['drug_class', 'class', 'pharmacologicalClass', 'pharmacological_class', 'therapeuticClass'],
  mechanism: ['mechanism_of_action', 'mechanismOfAction', 'moa', 'pharmacodynamics'],
  pharmacokinetics: ['pharmaco_kinetics', 'pk', 'adme', 'pharmacology'],
  contraindications: ['contra_indications', 'contraindication', 'cautions'],
  monitoring: ['monitoring_requirements', 'monitoringParameters', 'monitoring_parameters', 'labMonitoring'],
  majorInteractions: [
    'major_interactions', 'drugInteractions', 'drug_interactions',
    'interactions', 'significantInteractions',
  ],
};

const canonicalise = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Turns anything the model returned into flat strings. A nested object is the
 * common case: "pharmacokinetics" comes back as { absorption, distribution,
 * metabolism, excretion } about as often as it comes back as a sentence.
 */
function flatten(value) {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value === null || value === undefined) return [];
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nested]) => {
      const parts = flatten(nested);
      if (parts.length === 0) return [];
      // Keep the key: "Absorption: rapid" reads far better than a bare "rapid"
      // in a list of four unlabelled sentences.
      const label = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
      return parts.map((part) => (label ? `${label[0].toUpperCase()}${label.slice(1)}: ${part}` : part));
    });
  }
  return [String(value)];
}

const asText = (value) => flatten(value).map((part) => part.trim()).filter(Boolean).join(' ');
const asList = (value) => flatten(value).map((part) => part.trim()).filter(Boolean);

function pick(source, canonicalKey) {
  const wanted = [canonicalKey, ...(ALIASES[canonicalKey] || [])].map(canonicalise);
  for (const [key, value] of Object.entries(source)) {
    if (wanted.includes(canonicalise(key))) return value;
  }
  return undefined;
}

function normalizeProfessionalInfo(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const out = {};
  for (const field of TEXT_FIELDS) out[field] = asText(pick(raw, field));
  for (const field of LIST_FIELDS) out[field] = asList(pick(raw, field));
  return out;
}

/**
 * Enough to be worth showing. A record with no mechanism and no class is not a
 * clinical summary, it is an empty page with headings on it.
 */
function isCacheableProfessionalInfo(info) {
  if (!info) return false;
  const substantive = [info.drugClass, info.mechanism, info.pharmacokinetics]
    .filter((value) => value && value.trim().length > 20);
  return substantive.length >= 2;
}

/**
 * Whether an entry carries what the redesigned screen needs. Entries cached
 * before these fields existed would render as a page of empty rows, so
 * generate.js treats a false here as a stale shape and refetches once.
 */
function hasProfessionalFields(info) {
  return Boolean(info && info.drugClass && info.drugClass.trim() && info.mechanism && info.mechanism.trim());
}

/** The prompts that ask for this view rather than the patient one. */
const PROFESSIONAL_MARKERS = ['healthcare professional', 'professional', 'technical'];

const isProfessionalPrompt = (prompt) => {
  const lower = String(prompt || '').toLowerCase();
  return PROFESSIONAL_MARKERS.some((marker) => lower.includes(marker));
};

const PROFESSIONAL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    genericName: {
      type: 'STRING',
      description: 'The INN / generic name alone, e.g. "Atorvastatin". No brand, no strength.',
    },
    atcCode: {
      type: 'STRING',
      description:
        'The WHO ATC code, e.g. "C10AA05". Empty string if there is no single applicable code — never guess one.',
    },
    formAndStrength: {
      type: 'STRING',
      description:
        'Salt or ester and the usual presentation, e.g. "calcium trihydrate · 20 mg f/c tab". Abbreviations are expected here.',
    },
    drugClass: {
      type: 'STRING',
      description: 'Pharmacological class in one line, e.g. "HMG-CoA reductase inhibitor (statin)".',
    },
    mechanism: {
      type: 'STRING',
      description:
        'Mechanism of action, one or two sentences, written for a clinician. Name the target and the downstream effect.',
    },
    pharmacokinetics: {
      type: 'STRING',
      description:
        'ADME in the compressed form a clinician expects: bioavailability, metabolism and the enzymes involved, ' +
        'half-life, route of excretion. Two or three sentences.',
    },
    contraindications: {
      type: 'STRING',
      description: 'Absolute contraindications, one sentence, separated by commas.',
    },
    majorInteractions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description:
        'The clinically significant interactions, each a short label of two to four words — ' +
        '"Strong CYP3A4 inhibitors", "Ciclosporin", "Gemfibrozil". Not sentences.',
    },
    monitoring: {
      type: 'STRING',
      description:
        'What to monitor and when, e.g. "Lipid panel at 4-12 weeks after initiation or dose change." ' +
        'Empty string if nothing routine is required.',
    },
  },
  required: [
    'genericName', 'atcCode', 'formAndStrength', 'drugClass', 'mechanism',
    'pharmacokinetics', 'contraindications', 'majorInteractions', 'monitoring',
  ],
  propertyOrdering: [
    'genericName', 'atcCode', 'formAndStrength', 'drugClass', 'mechanism',
    'pharmacokinetics', 'contraindications', 'majorInteractions', 'monitoring',
  ],
};

module.exports = {
  normalizeProfessionalInfo,
  isCacheableProfessionalInfo,
  hasProfessionalFields,
  isProfessionalPrompt,
  PROFESSIONAL_SCHEMA,
  TEXT_FIELDS,
  LIST_FIELDS,
  ALIASES,
};
