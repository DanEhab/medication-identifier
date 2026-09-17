/**
 * What shape the medicine comes in, read off the answer.
 *
 * The identity block used to show a plain dark square — a placeholder that
 * never became anything, and that was hidden outright in Arabic, so half the
 * users saw a name with nothing beside it. A picture of the actual form is
 * worth more than a swatch: somebody holding a tube and looking at a page
 * showing a tablet knows immediately that they searched the wrong thing.
 *
 * Three sources, in order of how much they can be trusted:
 *
 *   1. `dosageForm`, which the model is now asked for directly as one of a
 *      fixed list. Only newer answers carry it.
 *   2. The words in `strength` and `drugName` — "20 mg film-coated tablet",
 *      "2% cream". This is what every answer cached before the field existed
 *      has, and it is usually enough.
 *   3. Nothing recognisable, which is its own answer rather than a guess: a
 *      generic mark, not a tablet chosen because tablets are commonest.
 *
 * The words are matched in Arabic as well as English, because `strength` and
 * `drugName` are translated for display and an Arabic reader's copy says
 * "قرص", not "tablet".
 */

export type DosageForm =
  | 'tablet'
  | 'capsule'
  | 'liquid'
  | 'drops'
  | 'cream'
  | 'inhaler'
  | 'injection'
  | 'suppository'
  | 'patch'
  | 'spray'
  | 'sachet'
  | 'unknown';

/** The values the model may return, so the schema and this agree. */
export const DOSAGE_FORMS: DosageForm[] = [
  'tablet', 'capsule', 'liquid', 'drops', 'cream', 'inhaler',
  'injection', 'suppository', 'patch', 'spray', 'sachet', 'unknown',
];

/*
  Ordered, because several of these words co-occur and the first match wins.

  "Eye drops" and "oral drops" are both drops; "nasal spray" is a spray but an
  asthma inhaler is an inhaler even though it sprays. The ordering resolves
  those: the more specific device comes before the more general action.
*/
const PATTERNS: { form: DosageForm; words: string[] }[] = [
  { form: 'inhaler', words: ['inhaler', 'inhalation', 'puffer', 'nebuli', 'بخاخة', 'استنشاق', 'بخاخ للربو'] },
  { form: 'patch', words: ['patch', 'transdermal', 'لاصقة', 'لصقة'] },
  { form: 'suppository', words: ['suppository', 'suppositories', 'pessary', 'لبوس', 'تحميلة', 'تحاميل'] },
  { form: 'injection', words: [
    'injection', 'injectable', 'ampoule', 'ampule', 'vial', 'syringe', 'prefilled', 'pre-filled',
    'intramuscular', 'intravenous', 'subcutaneous', 'حقن', 'حقنة', 'أمبول', 'امبول', 'فيال',
  ] },
  { form: 'drops', words: ['drop', 'drops', 'نقط', 'قطرة', 'قطرات'] },
  { form: 'spray', words: ['spray', 'nasal', 'بخاخ', 'رذاذ'] },
  { form: 'cream', words: [
    'cream', 'ointment', 'gel', 'lotion', 'balm', 'topical', 'salve', 'paste',
    'كريم', 'مرهم', 'جل', 'لوشن', 'دهان', 'موضعي',
  ] },
  { form: 'sachet', words: [
    'sachet', 'powder', 'granule', 'effervescent', 'كيس', 'أكياس', 'اكياس',
    'بودرة', 'مسحوق', 'حبيبات', 'فوار',
  ] },
  { form: 'liquid', words: [
    'syrup', 'suspension', 'solution', 'elixir', 'oral liquid', 'liquid', 'شراب', 'معلق', 'محلول', 'سائل',
  ] },
  { form: 'capsule', words: ['capsule', 'caplet', 'softgel', 'كبسولة', 'كبسولات', 'كبسول'] },
  { form: 'tablet', words: [
    'tablet', 'tablets', 'pill', 'lozenge', 'chewable', 'film-coated', 'film coated',
    'قرص', 'أقراص', 'اقراص', 'حبة', 'حبوب', 'مضغ',
  ] },
];

/**
 * The form named by a piece of text, or null.
 *
 * Latin words are matched on a boundary so "droplet" is not "drop" and
 * "tabletop" is not "tablet". Arabic has no case and its prefixes attach
 * directly to the word — "بالقرص" is still about a قرص — so those are matched
 * as substrings, which is what makes them findable at all.
 */
const formIn = (text: string): DosageForm | null => {
  if (!text) return null;
  const haystack = text.toLowerCase();

  for (const { form, words } of PATTERNS) {
    for (const word of words) {
      const isLatin = /^[a-z\s-]+$/.test(word);
      const found = isLatin
        ? new RegExp(`(^|[^a-z])${word.replace(/[-]/g, '[-\\s]?')}(s?)([^a-z]|$)`).test(haystack)
        : haystack.includes(word);
      if (found) return form;
    }
  }
  return null;
};

/** Whether a value from the model is one of the forms the app can draw. */
const asDosageForm = (value: unknown): DosageForm | null => {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().toLowerCase();
  const match = DOSAGE_FORMS.find((form) => form === cleaned);
  return match && match !== 'unknown' ? match : null;
};

export interface FormSource {
  dosageForm?: string;
  strength?: string;
  drugName?: string;
}

/**
 * Whether this is something a person swallows.
 *
 * "How to take it" is the wrong heading over a cream, an inhaler or a patch —
 * nobody takes a cream. The forms are already known, so the heading can simply
 * be right. Anything unrecognised keeps "take", which is what the majority of
 * medicines are and reads as neutral rather than wrong.
 */
const NOT_SWALLOWED: DosageForm[] = [
  'cream', 'inhaler', 'injection', 'suppository', 'patch', 'spray', 'drops',
];

export const isSwallowed = (form: DosageForm): boolean => !NOT_SWALLOWED.includes(form);

/**
 * The form to draw for a medicine. Never throws and never returns nothing:
 * an unreadable answer is 'unknown', which has a mark of its own.
 */
export const dosageFormOf = (info: FormSource | null | undefined): DosageForm => {
  if (!info) return 'unknown';

  // What the model said, when it said anything.
  const stated = asDosageForm(info.dosageForm);
  if (stated) return stated;

  /*
    Strength first, because it is the field that describes the pack —
    "20 mg film-coated tablet". The name is second and is more likely to carry
    a word that means something else: "Solution" is a brand, and a medicine
    called "Dermal Cream" might be a gel.
  */
  return formIn(info.strength || '') || formIn(info.drugName || '') || 'unknown';
};
