/**
 * The last few medicines this person looked up.
 *
 * People look the same medicine up repeatedly — their own prescription, or a
 * relative's — and typing it correctly on a phone keyboard is the slowest part
 * of the whole app. These are recorded on a successful lookup only, so a
 * misspelling that went nowhere never comes back as a suggestion.
 *
 * Stays on the device. It is a list of medicines somebody takes, which is about
 * as personal as this app gets, and it has no reason to leave the phone.
 */

const STORAGE_KEY = 'recentSearches';
const MAX_RECENTS = 8;

export const getRecentSearches = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  } catch {
    // Corrupt or unavailable storage behaves as "nothing looked up yet".
    return [];
  }
};

/** Most recent first, with no duplicates however it was capitalised. */
export const recordRecentSearch = (term: string): void => {
  const cleaned = term.trim();
  if (!cleaned) return;
  try {
    const existing = getRecentSearches().filter(
      (entry) => entry.toLowerCase() !== cleaned.toLowerCase(),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify([cleaned, ...existing].slice(0, MAX_RECENTS)));
  } catch {
    /* Private mode or storage disabled — recents simply do not accumulate. */
  }
};

export const clearRecentSearches = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing to do: there is no list to clear. */
  }
};
