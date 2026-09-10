import type { SavedMedication } from './medicationStorage';

/**
 * Two medicines on the same list that should not be taken together.
 *
 * This invents no clinical knowledge. Every answer already carries a "never
 * with" line — the things that medicine must not be taken alongside — and this
 * only asks whether one of those things is something else on the same person's
 * list. That is a text match against what the app was already told, which is
 * why it can miss things: a warning here is worth acting on, but the absence of
 * one is not a statement that a combination is safe, and the screen says so.
 */

export interface Interaction {
  /** The medicine whose warning names the other. */
  aName: string;
  /** The medicine it names. */
  bName: string;
  /** The term that matched, in the words the answer used. */
  matched: string;
  /** The whole "never with" line, so the warning can be read in context. */
  warning: string;
}

/**
 * Words that appear in almost every warning and name no medicine. Matching on
 * these would warn about every pair on the list, which trains people to ignore
 * the warning entirely.
 */
const NOT_A_MEDICINE = new Set([
  'alcohol', 'grapefruit', 'juice', 'food', 'drink', 'drinks', 'water', 'milk',
  'dairy', 'caffeine', 'coffee', 'tea', 'medicines', 'medicine', 'medication',
  'medications', 'drugs', 'drug', 'other', 'others', 'some', 'any', 'certain',
  'products', 'supplements', 'tablets', 'capsules', 'none', 'nothing',
]);

/** Shorter than this and a coincidental match is likelier than a real one. */
const MIN_TERM_LENGTH = 5;

const clean = (value: string) => value.trim().toLowerCase();

/** The names one saved medicine can be recognised by. */
const namesOf = (entry: SavedMedication): string[] => {
  const info = entry.drugInfo;
  return [info.brandName, info.drugName, info.canonicalName, entry.originalName]
    .map((name) => clean(name || ''))
    .filter(Boolean);
};

/**
 * Splits a "never with" line into the individual things it names. The answers
 * use "·" between items, but the model also writes commas and "and".
 */
const termsIn = (warning: string): string[] =>
  clean(warning)
    // Newlines included: entries cached before the separator was normalised
    // still carry the line breaks the model originally answered with.
    .split(/[·,;/\r\n]|\band\b|\bor\b/)
    .map((part) => part.replace(/\([^)]*\)/g, '').trim())
    .filter(Boolean);

/**
 * Whether a warning term names a particular medicine.
 *
 * Compared word by word rather than as whole strings, because the term is
 * usually an ingredient ("clarithromycin") while the saved medicine is a brand
 * with a strength attached ("Klacid 500mg").
 */
const termNames = (term: string, names: string[]): string | null => {
  const words = term.split(/\s+/).filter((word) => word.length >= MIN_TERM_LENGTH && !NOT_A_MEDICINE.has(word));
  if (words.length === 0) return null;

  for (const name of names) {
    const nameWords = new Set(name.split(/[\s+\-/()]+/).filter(Boolean));
    for (const word of words) {
      // Whole word, or the name's own word starts with it — "atorvastatin"
      // should match "atorvastatin calcium" but not "statin".
      for (const nameWord of nameWords) {
        if (nameWord === word || nameWord.startsWith(word) || word.startsWith(nameWord)) {
          if (nameWord.length >= MIN_TERM_LENGTH) return word;
        }
      }
    }
  }
  return null;
};

/** The name to show for a saved medicine. */
export const displayNameOf = (entry: SavedMedication): string =>
  (entry.drugInfo.brandName || '').trim() ||
  (entry.drugInfo.drugName || '').trim() ||
  entry.originalName;

/**
 * Every pair on the list where one names the other in its "never with" line.
 * A pair is reported once, however many terms matched.
 */
export const findInteractions = (saved: SavedMedication[]): Interaction[] => {
  const found: Interaction[] = [];
  const reported = new Set<string>();

  for (const a of saved) {
    const warning = (a.drugInfo.neverWith || '').trim();
    if (!warning) continue;
    const terms = termsIn(warning);
    if (terms.length === 0) continue;

    for (const b of saved) {
      if (a === b) continue;
      const bNames = namesOf(b);
      if (bNames.length === 0) continue;

      // The same medicine saved under two spellings is not an interaction.
      const aNames = namesOf(a);
      if (aNames.some((name) => bNames.includes(name))) continue;

      for (const term of terms) {
        const matched = termNames(term, bNames);
        if (!matched) continue;

        const pair = [displayNameOf(a), displayNameOf(b)].map(clean).sort().join('|');
        if (reported.has(pair)) break;
        reported.add(pair);

        found.push({
          aName: displayNameOf(a),
          bName: displayNameOf(b),
          matched: term,
          warning,
        });
        break;
      }
    }
  }

  return found;
};
