import type { DrugInfo } from '../types';

const STORAGE_KEY = 'myMedications';

/** Drug names are matched case-insensitively everywhere. */
const sameDrug = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const getSavedMedications = (): DrugInfo[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[medicationStorage] could not read saved medications', error);
    return [];
  }
};

const write = (medications: DrugInfo[]): DrugInfo[] => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(medications));
  } catch (error) {
    console.error('[medicationStorage] could not save medications', error);
  }
  return medications;
};

export const isMedicationSaved = (drugName: string): boolean =>
  getSavedMedications().some((med) => sameDrug(med.drugName, drugName));

export const saveMedication = (drugInfo: DrugInfo): DrugInfo[] => {
  const existing = getSavedMedications().filter((med) => !sameDrug(med.drugName, drugInfo.drugName));
  return write([...existing, drugInfo]);
};

export const removeMedication = (drugName: string): DrugInfo[] =>
  write(getSavedMedications().filter((med) => !sameDrug(med.drugName, drugName)));

/** Adds when absent, removes when present. Returns the new saved state. */
export const toggleMedication = (drugInfo: DrugInfo): boolean => {
  if (isMedicationSaved(drugInfo.drugName)) {
    removeMedication(drugInfo.drugName);
    return false;
  }
  saveMedication(drugInfo);
  return true;
};
