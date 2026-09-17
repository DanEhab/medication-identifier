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
// only ever used to look up an alias. The storage key is derived from the
// product the model names, and is what the answer is actually stored under. A
// typo becomes a pointer, not a duplicate.
//
// The storage key used to be the generic ingredient, so that every brand of
// paracetamol shared one entry. That was wrong, and wrong in the way this app
// can least afford. An entry carries the identity of whatever generated it —
// one brand's name, one brand's strength — and the result screen leads with
// that name. So searching "Abimol" returned a page headed "Panadol".
//
// For a medicine cabinet that is not a cosmetic bug. The point of the app is
// telling somebody what they are holding, and somebody who believes Abimol and
// Panadol are different medicines can take both, which is a paracetamol
// overdose. The ingredient is still recorded on every entry — it is what
// interaction checks read — but it is no longer what decides identity.

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
 * The key an answer is stored under: the product, not the ingredient.
 *
 * Every spelling of one product still collapses onto one entry, because the
 * brand the model names is the same for all of them — which is the saving the
 * cache was built for:
 *
 *   "panadooll"      -> brandName "Panadol"       -> panadol
 *   "بنادول"          -> brandName "Panadol"       -> panadol
 *   "Panadol 500mg"  -> brandName "Panadol"       -> panadol
 *   "abimol"         -> brandName "Abimol"        -> abimol
 *   "Panadol Extra"  -> brandName "Panadol Extra" -> panadol extra
 *
 * A search for a generic name has no brand to key on and falls back to the
 * ingredient, which is the one case where the ingredient is the right answer.
 *
 * Derived from the answer itself rather than from the resolution step, so the
 * key and the contents cannot disagree. They used to: the key came from one
 * model call and the answer from another, and an entry keyed "fusidic acid"
 * ended up holding the record for fluocinolone acetonide — an antibiotic's name
 * over a steroid's warnings.
 */
function storageKeyFor(drugInfo) {
  if (!drugInfo) return null;

  const fromIngredient = queryKeyFor(drugInfo.canonicalName);
  const fromBrand = queryKeyFor(drugInfo.brandName);

  // A "brand" that only restates the ingredient is not a brand. Medicines sold
  // generically come back that way, and they should key on the ingredient.
  if (fromBrand && fromBrand !== fromIngredient) return fromBrand;
  if (fromIngredient) return fromIngredient;

  // Neither field is usable. Fall back to the display name so the entry is
  // still stored somewhere sensible rather than not at all.
  return queryKeyFor(drugInfo.drugName) || null;
}

/**
 * Whether a search term may be recorded as meaning a particular entry.
 *
 * An alias is a claim that two pieces of text are the same medicine, and it is
 * then served to everybody, so the cost of a wrong one is not the cost of a
 * wrong guess — it is that guess repeated indefinitely.
 *
 * The shape worth refusing is one ingredient pointing at a combination.
 * Somebody searched "calcium", the answer that came back described a
 * four-ingredient supplement, and every later "calcium" was served that
 * supplement. Naming one ingredient of a combination is not a spelling of it.
 * Naming all of them is, so "glucosamine and chondroitin" still resolves.
 *
 * This fails closed: a real name for a combination that repeats none of its
 * ingredients, like "co-amoxiclav", simply gets no alias and is looked up
 * again. That costs one model call and is never wrong.
 */
function aliasIsSafe(queryKey, storageKey) {
  if (!queryKey || !storageKey || queryKey === storageKey) return false;
  if (!storageKey.includes('+')) return true;
  return storageKey.split('+').every((ingredient) => queryKey.includes(ingredient));
}

module.exports = { normalizeKey, queryKeyFor, storageKeyFor, aliasIsSafe };
