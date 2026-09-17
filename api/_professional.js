// api/_professional.js — the clinician's view of the same drug.
//
// The patient answer has had a response schema and a normaliser since the
// caching work; this one had neither. It was parsed straight out of whatever
// the model returned, with fields typed `any` that could arrive as a string, an
// array or a nested object, and a JSON.parse that threw the whole request away
// when the model wrapped its answer differently. Same treatment as the patient
// record: pin the keys, flatten the shapes, guarantee what the screen renders.
//
// ── Structure, not one long string per heading ──────────────────────────────
//
// The first version of this schema asked for everything as flat prose, which
// made the screen a column of paragraphs: pharmacokinetics was one sentence
// where a clinician reads four, and the interactions were a row of labels with
// nothing saying what any of them does. An earlier build of this app had that
// detail and lost it.
//
// So the fields that have parts now say so — ADME is four named parts, adverse
// effects are grouped by system, interactions are grouped by mechanism — and
// the screen renders those parts as subheadings under a heading. The model
// fills structure more reliably than it fills a paragraph that is secretly a
// list, and `flatten` below still rescues the case where it answers with prose
// anyway.

const TEXT_FIELDS = [
  'genericName',
  'atcCode',
  'formAndStrength',
  'drugClass',
  'indications',
  'mechanism',
  'monitoring',
  // Niche, and empty for most medicines. Shown last, and only when present.
  'chemistry',
  'bcsClass',
];

const LIST_FIELDS = ['contraindications', 'majorInteractions', 'references'];

/** ADME, as the four parts it is always taught and read as. */
const PK_PARTS = ['absorption', 'distribution', 'metabolism', 'excretion', 'halfLife'];

/** Names the model has been seen to use for the ones asked for. */
const ALIASES = {
  genericName: ['generic_name', 'inn', 'activeIngredient', 'active_ingredient', 'drugName', 'drug_name'],
  atcCode: ['atc_code', 'atc', 'atcClassification', 'atc_classification'],
  formAndStrength: ['form_and_strength', 'formStrength', 'form', 'strength', 'presentation'],
  drugClass: ['drug_class', 'class', 'pharmacologicalClass', 'pharmacological_class', 'therapeuticClass'],
  indications: ['indication', 'uses', 'clinicalUse', 'clinical_use', 'therapeuticUse', 'pharmacology'],
  mechanism: ['mechanism_of_action', 'mechanismOfAction', 'moa', 'pharmacodynamics'],
  pharmacokinetics: ['pharmaco_kinetics', 'pk', 'adme'],
  contraindications: ['contra_indications', 'contraindication', 'cautions'],
  adverseEffects: ['adverse_effects', 'adverseReactions', 'adverse_reactions', 'sideEffects', 'side_effects'],
  /*
    Both of these answer to "drugInteractions", because the model uses that
    name for whichever of the two it happens to produce. They are told apart by
    shape instead: a list of short labels is the at-a-glance row, and a list of
    objects — or an object keyed by mechanism — is the grouped detail. Guessing
    from the name alone put a grouped answer into the chips as "Group: detail"
    strings, and a flat answer into the detail with no heading on it.
  */
  interactions: ['drugInteractions', 'drug_interactions', 'interactionDetail', 'interaction_detail'],
  majorInteractions: [
    'major_interactions', 'significantInteractions', 'keyInteractions', 'key_interactions',
    'drugInteractions', 'drug_interactions', 'interactions',
  ],
  monitoring: ['monitoring_requirements', 'monitoringParameters', 'monitoring_parameters', 'labMonitoring'],
  chemistry: ['chemical', 'chemicalDescription', 'chemical_description', 'salt'],
  bcsClass: ['bcs', 'bcs_class', 'biopharmaceuticsClass'],
  references: ['reference', 'sources', 'source', 'furtherReading', 'further_reading'],
  // Inside pharmacokinetics.
  absorption: ['bioavailability'],
  distribution: ['proteinBinding', 'protein_binding', 'volumeOfDistribution'],
  metabolism: ['biotransformation'],
  excretion: ['elimination', 'clearance'],
  halfLife: ['half_life', 'eliminationHalfLife', 'elimination_half_life', 't12'],
  system: ['category', 'organSystem', 'organ_system', 'bodySystem', 'group'],
  effects: ['items', 'reactions', 'symptoms', 'list'],
  group: ['category', 'mechanism', 'heading', 'title', 'name', 'system'],
  detail: ['description', 'text', 'body', 'note', 'effect'],
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
  if (!source || typeof source !== 'object') return undefined;
  const wanted = [canonicalKey, ...(ALIASES[canonicalKey] || [])].map(canonicalise);
  for (const [key, value] of Object.entries(source)) {
    if (wanted.includes(canonicalise(key))) return value;
  }
  return undefined;
}

/**
 * The four parts of ADME plus the half-life.
 *
 * Accepts the object it asks for, and survives the model answering with one
 * paragraph instead: the whole thing then lands in absorption rather than
 * being thrown away, because a clinician reading a paragraph under the wrong
 * subheading is better served than one reading nothing.
 */
function normalizePharmacokinetics(raw) {
  const out = {};
  for (const part of PK_PARTS) out[part] = '';
  if (!raw) return out;

  if (typeof raw === 'string') {
    out.absorption = raw.trim();
    return out;
  }
  if (Array.isArray(raw)) {
    out.absorption = asText(raw);
    return out;
  }
  for (const part of PK_PARTS) out[part] = asText(pick(raw, part));
  // Nothing matched a known part, so it is some other shape entirely.
  if (PK_PARTS.every((part) => !out[part])) out.absorption = asText(raw);
  return out;
}

/**
 * A list of { heading, items } groups, however the model chose to express it.
 *
 * Three shapes turn up: the array of objects that was asked for, an object
 * keyed by heading, and a flat list of "Cardiovascular: palpitations" strings.
 * All three mean the same thing and all three are read here, because losing
 * the grouping is losing the reason the section is readable.
 */
function normalizeGroups(raw, headingKey, bodyKey) {
  if (!raw) return [];

  const fromEntry = (heading, body) => {
    const items = asList(body);
    const title = String(heading || '').replace(/[_-]+/g, ' ').trim();
    if (items.length === 0) return null;
    return { heading: title, items };
  };

  if (Array.isArray(raw)) {
    const groups = [];
    const loose = [];
    for (const entry of raw) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const group = fromEntry(asText(pick(entry, headingKey)), pick(entry, bodyKey));
        if (group) groups.push(group);
        continue;
      }
      const line = String(entry ?? '').trim();
      if (!line) continue;
      // "Cardiovascular: palpitations, tachycardia" — a heading hiding in a
      // string, which is what comes back when the model flattens its own list.
      const split = line.match(/^([A-Z][^:]{2,40}):\s*(.+)$/);
      if (split) groups.push({ heading: split[1].trim(), items: [split[2].trim()] });
      else loose.push(line);
    }
    if (loose.length) groups.push({ heading: '', items: loose });
    return groups;
  }

  if (typeof raw === 'object') {
    return Object.entries(raw)
      .map(([key, value]) => fromEntry(key, value))
      .filter(Boolean);
  }

  const single = asList(raw);
  return single.length ? [{ heading: '', items: single }] : [];
}

function normalizeProfessionalInfo(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const out = {};
  for (const field of TEXT_FIELDS) out[field] = asText(pick(raw, field));
  for (const field of LIST_FIELDS) out[field] = asList(pick(raw, field));

  out.pharmacokinetics = normalizePharmacokinetics(pick(raw, 'pharmacokinetics'));
  out.adverseEffects = normalizeGroups(pick(raw, 'adverseEffects'), 'system', 'effects');

  /*
    The two interaction fields share a name in the wild, so shape decides.
    Plain strings are labels to scan; anything structured is the detail. A
    field that gave one of them never also fills the other, or the same
    interactions appear twice on the screen under different headings.
  */
  const interactionsRaw = pick(raw, 'interactions');
  const isStructured = interactionsRaw
    && (!Array.isArray(interactionsRaw)
      ? typeof interactionsRaw === 'object'
      : interactionsRaw.some((entry) => entry && typeof entry === 'object'));

  out.interactions = isStructured ? normalizeGroups(interactionsRaw, 'group', 'detail') : [];
  if (isStructured && out.majorInteractions.length && pick(raw, 'majorInteractions') === interactionsRaw) {
    // The chips were filled from the same structured value, so they are that
    // value flattened. Better empty than a row of "Group: detail" labels.
    out.majorInteractions = [];
  }

  return out;
}

/** Whether any part of the kinetics was filled in. */
const hasKinetics = (info) =>
  Boolean(info && info.pharmacokinetics
    && PK_PARTS.some((part) => (info.pharmacokinetics[part] || '').trim().length > 12));

/**
 * Enough to be worth showing. A record with no mechanism and no class is not a
 * clinical summary, it is an empty page with headings on it.
 */
function isCacheableProfessionalInfo(info) {
  if (!info) return false;
  const substantive = [info.drugClass, info.mechanism, info.indications]
    .filter((value) => value && value.trim().length > 20);
  return substantive.length >= 2 || (substantive.length >= 1 && hasKinetics(info));
}

/**
 * Whether an entry carries what the redesigned screen needs.
 *
 * The bar moved when the screen gained its structure: an entry written against
 * the flat schema has a pharmacokinetics *string* and no grouped adverse
 * effects, so it would render as a page with four empty subheadings on it.
 * generate.js treats a false here as a stale shape and refetches once, which
 * is how the old entries are replaced without anybody having to find them.
 */
function hasProfessionalFields(info) {
  if (!info || !info.drugClass || !info.drugClass.trim()) return false;
  if (!info.mechanism || !info.mechanism.trim()) return false;
  return hasKinetics(info) && Array.isArray(info.adverseEffects) && info.adverseEffects.length > 0;
}

/** The prompts that ask for this view rather than the patient one. */
const PROFESSIONAL_MARKERS = ['healthcare professional', 'professional', 'technical'];

const isProfessionalPrompt = (prompt) => {
  const lower = String(prompt || '').toLowerCase();
  return PROFESSIONAL_MARKERS.some((marker) => lower.includes(marker));
};

const GROUPED_ITEMS = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      system: { type: 'STRING', description: 'The heading for this group.' },
      effects: { type: 'ARRAY', items: { type: 'STRING' }, description: 'The entries under it.' },
    },
    required: ['system', 'effects'],
  },
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
    indications: {
      type: 'STRING',
      description:
        'What it is licensed and used for, in clinical terms, two or three sentences. Name the conditions '
        + 'and the place in therapy, not the patient-facing benefit.',
    },
    mechanism: {
      type: 'STRING',
      description:
        'Mechanism of action, two to four sentences, written for a clinician. Name the target, the '
        + 'downstream effect, and the active metabolite if there is one.',
    },
    pharmacokinetics: {
      type: 'OBJECT',
      description: 'ADME, as its four parts. Each one or two sentences; never leave all four empty.',
      properties: {
        absorption: {
          type: 'STRING',
          description: 'Bioavailability, time to peak, and what alters absorption (food, other drugs).',
        },
        distribution: {
          type: 'STRING',
          description: 'Protein binding, volume of distribution, and where it does and does not go.',
        },
        metabolism: {
          type: 'STRING',
          description: 'Route of metabolism and the enzymes involved, naming CYP isoforms where relevant.',
        },
        excretion: {
          type: 'STRING',
          description: 'Route of elimination, and what renal or hepatic impairment does to it.',
        },
        halfLife: {
          type: 'STRING',
          description:
            'The elimination half-life as a bare figure and nothing else: "6-7 days", "14 h", '
            + '"36-42 hours". No sentence, no verb, no full stop, under 25 characters. This is set '
            + 'large on screen as the number a clinician looks for first, so anything longer than a '
            + 'figure does not fit. Put steady state and any caveats in "excretion" instead.',
        },
      },
      required: ['absorption', 'distribution', 'metabolism', 'excretion', 'halfLife'],
    },
    contraindications: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Absolute contraindications, one per entry, each a short phrase rather than a sentence.',
    },
    majorInteractions: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description:
        'The clinically significant interactions as short labels of two to four words — '
        + '"Strong CYP3A4 inhibitors", "Ciclosporin", "Gemfibrozil". Not sentences. These are read at a '
        + 'glance; the detail goes in "interactions".',
    },
    interactions: {
      type: 'ARRAY',
      description:
        'The same interactions grouped by what is actually happening, so each group explains itself. '
        + 'Group by mechanism — "Decreased absorption", "Enzyme induction", "Additive QT prolongation" — '
        + 'and say what to do about it, including any separation interval.',
      items: {
        type: 'OBJECT',
        properties: {
          group: { type: 'STRING', description: 'The mechanism, as a short heading.' },
          detail: {
            type: 'STRING',
            description: 'Which drugs, what happens, and what to do — two or three sentences.',
          },
        },
        required: ['group', 'detail'],
      },
    },
    adverseEffects: {
      ...GROUPED_ITEMS,
      description:
        'Adverse effects grouped by organ system — Cardiovascular, CNS, Gastrointestinal, Metabolic, '
        + 'Musculoskeletal, Dermatologic, Hypersensitivity, and a "Serious / rare" group last. Each entry '
        + 'is a short phrase. Put the dose-related ones with the system they affect.',
    },
    monitoring: {
      type: 'STRING',
      description:
        'What to monitor and when, e.g. "Lipid panel at 4-12 weeks after initiation or dose change." '
        + 'Empty string if nothing routine is required.',
    },
    chemistry: {
      type: 'STRING',
      description:
        'Salt or ester, molecular formula and a one-line physical description, for the medicines where '
        + 'that matters. Empty string when it does not.',
    },
    bcsClass: {
      type: 'STRING',
      description:
        'Biopharmaceutics Classification System class with the solubility and permeability in brackets, '
        + 'e.g. "II (low solubility, high permeability)". Empty string if it is not classified or you are '
        + 'not sure.',
    },
    references: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description:
        'The standard sources a clinician would check this against, named plainly: the SPC or SmPC, '
        + 'DailyMed, the BNF, Martindale, a named textbook. NEVER invent a journal citation, a volume, '
        + 'page numbers, a DOI or a URL — name the source only. Empty array if unsure.',
    },
  },
  required: [
    'genericName', 'atcCode', 'formAndStrength', 'drugClass', 'indications', 'mechanism',
    'pharmacokinetics', 'contraindications', 'majorInteractions', 'interactions',
    'adverseEffects', 'monitoring', 'chemistry', 'bcsClass', 'references',
  ],
  propertyOrdering: [
    'genericName', 'atcCode', 'formAndStrength', 'drugClass', 'indications', 'mechanism',
    'pharmacokinetics', 'contraindications', 'majorInteractions', 'interactions',
    'adverseEffects', 'monitoring', 'chemistry', 'bcsClass', 'references',
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
  PK_PARTS,
  ALIASES,
};
