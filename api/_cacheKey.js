// api/_cacheKey.js — turns what a person typed into a stable cache key.
//
// The cache used to be keyed on the raw search term, so one medicine was stored
// once per spelling:
//
//   "panadooll"      -> Paracetamol (Panadol)
//   "panadol 500mg"  -> Paracetamol (Panadol)
//   "PANADOL"        -> Paracetamol (Panadol)
//
// Three rows, three Gemini calls, three separately worded answers for the same
// drug. That defeats both reasons the cache exists: cost and consistency.
//
// Now there are two keys. The query key is derived from the search term and is
// only ever used to look up an alias. The canonical key is derived from the
// generic ingredient name the model resolves the query to, and is what the
// answer is actually stored under. A typo becomes a pointer, not a duplicate.

/**
 * Reduces a string to a comparable key: lowercase, accents removed, and
 * anything that is not a letter, digit or "+" collapsed to a single space.
 *
 * Arabic letters are kept, because Egyptian users type brand names in Arabic
 * and those are perfectly good alias keys. "+" is kept because combination
 * products are canonicalised as "amoxicillin+clavulanic acid".
 */
function normalizeKey(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining accents so "Levothyrox" and "Lévothyrox" agree. Written
    // as escapes rather than literal marks so the source cannot be mangled.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+؀-ۿ]+/g, ' ')
    .trim()
    // "amoxicillin + clavulanic acid" and "amoxicillin+clavulanic acid" are the
    // same combination, so the spacing around the joiner must not matter.
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s+/g, ' ');
}

/**
 * Filler that carries no identifying information. Dropping it means
 * "ibuprofen 400mg tablets" and "ibuprofen" produce the same query key, so the
 * alias table stays small and hits more often.
 */
const NOISE = new Set([
  'tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules',
  'syrup', 'suspension', 'susp', 'drops', 'drop', 'cream', 'ointment', 'gel',
  'injection', 'inj', 'ampoule', 'vial', 'sachet', 'sachets', 'suppository',
  'mg', 'mcg', 'g', 'ml', 'iu', 'the', 'a', 'an',
]);

/** A bare quantity, or a quantity glued to its unit ("400mg", "5ml", "10"). */
const QUANTITY = /^\d+(?:[.,]\d+)?(?:mg|mcg|g|ml|iu|%)?$/;

/**
 * The key a search term is looked up under in the alias table.
 *
 * Strength and dosage form are removed deliberately. The cached answer already
 * lists every available strength and form, so "Ibuprofen 400mg" and
 * "ibuprofen 200 mg tablets" want the same entry, not two.
 */
function queryKeyFor(searchTerm) {
  const words = normalizeKey(searchTerm)
    .split(' ')
    .filter((word) => word && !NOISE.has(word) && !QUANTITY.test(word));

  // If stripping left nothing — someone searched "500mg" on its own — fall back
  // to the normalised term so the key is never empty.
  return words.length ? words.join(' ') : normalizeKey(searchTerm);
}

/**
 * The key an answer is stored under, derived from what the model resolved the
 * query to. Prefers the generic ingredient name, because that is the one thing
 * every spelling and every brand of the same medicine agrees on.
 */
function canonicalKeyFor(drugInfo) {
  if (!drugInfo) return null;
  const fromIngredient = queryKeyFor(drugInfo.canonicalName);
  if (fromIngredient) return fromIngredient;

  // No usable ingredient name. Fall back to the display name so the entry is
  // still stored somewhere sensible rather than not at all.
  const fromDisplayName = queryKeyFor(drugInfo.drugName);
  return fromDisplayName || null;
}

module.exports = { normalizeKey, queryKeyFor, canonicalKeyFor };
