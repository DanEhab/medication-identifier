import type { DrugInfo, Language } from '../types';
import { DEFAULT_PROFILE_ID, getActiveProfileId } from './profiles';

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
  /** Whose medicine it is. Anything saved before profiles existed is "me". */
  profileId: string;
  /** When to take it, as the person entered it. Absent until they say. */
  schedule?: MedicationSchedule;
}

/**
 * A reminder in the plainest sense: what the person wrote down for themselves.
 * The app does not dose anybody — these are their own notes, shown back.
 */
export interface MedicationSchedule {
  /** 24-hour "HH:MM", in the order they were added. */
  times: string[];
  /** Free text, e.g. "after dinner", "when needed · max 8 a day". */
  note: string;
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
/** Keeps a stored schedule only if it still looks like one. */
const normalizeSchedule = (raw: any): MedicationSchedule | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const times = Array.isArray(raw.times)
    ? raw.times.filter((time: unknown): time is string => typeof time === 'string' && /^\d{2}:\d{2}$/.test(time))
    : [];
  const note = typeof raw.note === 'string' ? raw.note.trim() : '';
  if (times.length === 0 && !note) return undefined;
  return { times, note };
};

const migrate = (entry: any): SavedMedication | null => {
  if (!entry || typeof entry !== 'object') return null;

  if (entry.drugInfo && typeof entry.drugInfo === 'object') {
    return {
      drugInfo: entry.drugInfo,
      language: entry.language === 'ar' ? 'ar' : 'en',
      originalName: entry.originalName || entry.drugInfo.drugName || '',
      savedAt: entry.savedAt || new Date(0).toISOString(),
      // Everything saved before there were profiles belongs to the first one.
      profileId: typeof entry.profileId === 'string' && entry.profileId ? entry.profileId : DEFAULT_PROFILE_ID,
      schedule: normalizeSchedule(entry.schedule),
    };
  }

  if (typeof entry.drugName !== 'string') return null;
  return {
    drugInfo: entry as DrugInfo,
    // The old format kept no language, so infer it from the script used.
    language: hasArabic(entry.drugName) ? 'ar' : 'en',
    originalName: entry.drugName,
    savedAt: new Date(0).toISOString(),
    profileId: DEFAULT_PROFILE_ID,
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

/** Only the person currently selected. Mum's list is not mine. */
export const getMedicationsFor = (profileId: string): SavedMedication[] =>
  getSavedMedications().filter((m) => m.profileId === profileId);

export const isMedicationSaved = (drugName: string, profileId = getActiveProfileId()): boolean =>
  getSavedMedications().some((m) => m.profileId === profileId && sameDrug(m.drugInfo.drugName, drugName));

export const saveMedication = (
  drugInfo: DrugInfo,
  language: Language,
  originalName: string,
  profileId = getActiveProfileId(),
): SavedMedication[] => {
  const all = getSavedMedications();
  const previous = all.find((m) => m.profileId === profileId && sameDrug(m.drugInfo.drugName, drugInfo.drugName));
  const others = all.filter((m) => m !== previous);
  const entry: SavedMedication = {
    drugInfo,
    language,
    originalName: originalName || drugInfo.drugName,
    savedAt: new Date().toISOString(),
    profileId,
    // Re-saving a medicine refreshes the record; it must not throw away the
    // times somebody entered for it.
    schedule: previous?.schedule,
  };
  return write([...others, entry]);
};

export const removeMedication = (drugName: string, profileId = getActiveProfileId()): SavedMedication[] =>
  write(getSavedMedications().filter(
    (m) => !(m.profileId === profileId && sameDrug(m.drugInfo.drugName, drugName)),
  ));

/** Replaces the times and note for one medicine. An empty schedule is removed. */
export const setSchedule = (
  drugName: string,
  schedule: MedicationSchedule | null,
  profileId = getActiveProfileId(),
): SavedMedication[] =>
  write(getSavedMedications().map((m) => {
    if (m.profileId !== profileId || !sameDrug(m.drugInfo.drugName, drugName)) return m;
    const keep = schedule && (schedule.times.length > 0 || schedule.note.trim());
    const { schedule: _dropped, ...rest } = m;
    return keep ? { ...rest, schedule: { times: schedule.times, note: schedule.note.trim() } } : rest;
  }));

/** Adds when absent, removes when present. Returns the new saved state. */
export const toggleMedication = (
  drugInfo: DrugInfo,
  language: Language,
  originalName: string,
  profileId = getActiveProfileId(),
): boolean => {
  if (isMedicationSaved(drugInfo.drugName, profileId)) {
    removeMedication(drugInfo.drugName, profileId);
    return false;
  }
  saveMedication(drugInfo, language, originalName, profileId);
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
