import { API_BASE_URL } from '../config';
import { getSavedMedications } from '../lib/medicationStorage';
import { getRecentSearches } from '../lib/recentSearches';

/**
 * Type-ahead for the search screen, from two places at once.
 *
 * What is already on the phone — saved medicines and recent searches — answers
 * instantly and works with no signal, which covers the common case of somebody
 * looking up their own prescription again. The server adds medicines the app
 * has answered for before, with their real strengths.
 *
 * Neither is required. Typing a name nobody has ever searched still works.
 */

export interface Suggestion {
  name: string;
  /** The line underneath: ingredient, strengths, or where it came from. */
  detail: string;
  source: 'saved' | 'recent' | 'remote';
}

export const MIN_QUERY_LENGTH = 2;
const MAX_SUGGESTIONS = 8;

const matches = (candidate: string, query: string): boolean => {
  const haystack = candidate.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle) return false;
  // A prefix is the strong match; a word start covers "extra" finding
  // "Panadol Extra" without matching every substring in the language.
  return haystack.startsWith(needle) || haystack.split(/[\s+\-/]+/).some((word) => word.startsWith(needle));
};

/**
 * Instant, offline, and specific to this person. Returned synchronously so the
 * list never flickers empty while a request is in flight.
 */
export const localSuggestions = (query: string, savedLabel: string, recentLabel: string): Suggestion[] => {
  const cleaned = query.trim();
  if (cleaned.length < MIN_QUERY_LENGTH) return [];

  const out: Suggestion[] = [];
  const seen = new Set<string>();

  const add = (name: string, detail: string, source: Suggestion['source']) => {
    const value = name.trim();
    if (!value || !matches(value, cleaned)) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: value, detail, source });
  };

  for (const saved of getSavedMedications()) {
    const info = saved.drugInfo;
    const name = (info.brandName || info.drugName || '').trim();
    const detail = [info.canonicalName, info.strength]
      .map((part) => (part || '').trim())
      .filter((part) => part && part.toLowerCase() !== name.toLowerCase())
      .join(' · ');
    add(name, detail || savedLabel, 'saved');
  }

  for (const recent of getRecentSearches()) add(recent, recentLabel, 'recent');

  return out.slice(0, MAX_SUGGESTIONS);
};

/**
 * Medicines the app has answered for before. Failure is silent: an unreachable
 * type-ahead leaves the local suggestions standing rather than showing an error
 * over somebody's half-typed word.
 */
export const remoteSuggestions = async (query: string, signal?: AbortSignal): Promise<Suggestion[]> => {
  const cleaned = query.trim();
  if (cleaned.length < MIN_QUERY_LENGTH) return [];

  try {
    const response = await fetch(`${API_BASE_URL}/api/suggest?q=${encodeURIComponent(cleaned)}`, { signal });
    if (!response.ok) return [];
    const payload = await response.json();
    if (!Array.isArray(payload?.suggestions)) return [];
    return payload.suggestions
      .filter((entry: unknown): entry is { name: string; detail?: string } =>
        Boolean(entry && typeof (entry as { name?: unknown }).name === 'string'))
      .map((entry: { name: string; detail?: string }) => ({
        name: entry.name,
        detail: entry.detail || '',
        source: 'remote' as const,
      }));
  } catch {
    return [];
  }
};

/** Local first — it is this person's own list — then anything new from the server. */
export const mergeSuggestions = (local: Suggestion[], remote: Suggestion[]): Suggestion[] => {
  const seen = new Set(local.map((entry) => entry.name.toLowerCase()));
  const merged = [...local];
  for (const entry of remote) {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged.slice(0, MAX_SUGGESTIONS);
};
