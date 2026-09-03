import type { DrugInfo, Language } from '../types';

const STORAGE_KEY = 'myMedications';

/**
 * Saved medicines are kept in full on the device so they open instantly and
 * work with no signal. Previously only the name was used and the whole record
 * was re-fetched over the network on every view, so the "offline access" the
 * store listing promised did not actually exist.
 */
export interface SavedMedication {
  /** The record exactly as it was displayed when saved. */
  drugInfo: DrugInfo;
  /** Which language the stored text is in — an Arabic record is no use to an English reader. */
  language: Language;
  /** The term used to look it up, so it can be refreshed later. */
  originalName: string;
  /** ISO timestamp, used to decide when a record has gone stale. */
  savedAt: string;
}

/** Matches the server's cache window, so offline copies do not outlive it. */
export const SAVED_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

/** Drug names are matched case-insensitively everywhere. */
const sameDrug = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const hasArabic = (text: string) => /[؀-ۿ]/.test(text || '');

/**
 * Earlier versions stored a bare DrugInfo with no language or timestamp.
 * Wrap those rather than discarding somebody's saved list.
 */
const migrate = (entry: any): SavedMedication | null => {
  if (!entry || typeof entry !== 'object') return null;

  if (entry.drugInfo && typeof entry.drugInfo === 'object') {
    return {
      drugInfo: entry.drugInfo,
      language: entry.language === 'ar' ? 'ar' : 'en',
      originalName: entry.originalName || entry.drugInfo.drugName || '',
      savedAt: entry.savedAt || new Date(0).toISOString(),
    };
  }

  if (typeof entry.drugName !== 'string') return null;
  return {
    drugInfo: entry as DrugInfo,
    // The old format kept no language, so infer it from the script used.
    language: hasArabic(entry.drugName) ? 'ar' : 'en',
    originalName: entry.drugName,
    savedAt: new Date(0).toISOString(),
  };
};

export const getSavedMedications = (): SavedMedication[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrate).filter((m): m is SavedMedication => m !== null);
  } catch (error) {
    console.error('[medicationStorage] could not read saved medications', error);
    return [];
  }
};

const write = (medications: SavedMedication[]): SavedMedication[] => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(medications));
  } catch (error) {
    // Quota exceeded, or storage disabled in a private window.
    console.error('[medicationStorage] could not save medications', error);
  }
  return medications;
};

export const isMedicationSaved = (drugName: string): boolean =>
  getSavedMedications().some((m) => sameDrug(m.drugInfo.drugName, drugName));

export const saveMedication = (
  drugInfo: DrugInfo,
  language: Language,
  originalName: string,
): SavedMedication[] => {
  const others = getSavedMedications().filter(
    (m) => !sameDrug(m.drugInfo.drugName, drugInfo.drugName),
  );
  const entry: SavedMedication = {
    drugInfo,
    language,
    originalName: originalName || drugInfo.drugName,
    savedAt: new Date().toISOString(),
  };
  return write([...others, entry]);
};

export const removeMedication = (drugName: string): SavedMedication[] =>
  write(getSavedMedications().filter((m) => !sameDrug(m.drugInfo.drugName, drugName)));

/** Adds when absent, removes when present. Returns the new saved state. */
export const toggleMedication = (
  drugInfo: DrugInfo,
  language: Language,
  originalName: string,
): boolean => {
  if (isMedicationSaved(drugInfo.drugName)) {
    removeMedication(drugInfo.drugName);
    return false;
  }
  saveMedication(drugInfo, language, originalName);
  return true;
};

/**
 * The stored copy for a medicine in the language being read, or null if there
 * isn't one. The language has to match before a record can be served offline.
 */
export const findSavedMedication = (
  drugName: string,
  language: Language,
): SavedMedication | null =>
  getSavedMedications().find(
    (m) =>
      m.language === language &&
      (sameDrug(m.drugInfo.drugName, drugName) || sameDrug(m.originalName, drugName)),
  ) || null;

/** Past the refresh window, so it should be updated in the background when online. */
export const isStale = (entry: SavedMedication): boolean => {
  const saved = Date.parse(entry.savedAt);
  if (Number.isNaN(saved)) return true;
  return Date.now() - saved > SAVED_MAX_AGE_MS;
};
