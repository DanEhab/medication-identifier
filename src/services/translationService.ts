import type { DrugInfo } from '../types';
import { API_BASE_URL } from '../config';

const TRANSLATION_API_URL = `${API_BASE_URL}/api/translate`;

/**
 * Translate text to Arabic using MyMemory API (via our serverless function)
 */
export const translateToArabic = async (text: string): Promise<string> => {
    try {
        const response = await fetch(TRANSLATION_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                from: 'en',
                to: 'ar'
            })
        });

        if (!response.ok) {
            throw new Error('Translation API error');
        }

        const data = await response.json();
        return data.translation || text;
    } catch (error) {
        console.error('Translation error:', error);
        return text; // Return original if translation fails
    }
};

/**
 * Translate array of strings to Arabic
 */
const translateArray = async (arr: string[]): Promise<string[]> => {
    try {
        const response = await fetch(TRANSLATION_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: arr,
                from: 'en',
                to: 'ar'
            })
        });

        if (!response.ok) {
            throw new Error('Translation API error');
        }

        const data = await response.json();
        return data.translations || arr;
    } catch (error) {
        console.error('Translation error:', error);
        return arr; // Return original if translation fails
    }
};

/**
 * Translate entire DrugInfo object to Arabic
 * MyMemory API is fast and reliable - can process all at once
 */
export const translateDrugInfo = async (drugInfo: DrugInfo): Promise<DrugInfo> => {
    try {
        // Every prose field, named once. The old version rebuilt the object
        // from a hand-written literal, so a field added anywhere else in the
        // app silently vanished in Arabic -- which is how the whole result
        // screen came back empty the first time it was translated.
        const TEXT: (keyof DrugInfo)[] = [
            'drugName', 'strength', 'commonUse', 'whatItIsFor', 'howToTake',
            'dosageAdministration', 'foodDrinkEffect', 'missedDose',
            'tellYourDoctorIf', 'neverWith',
            'quickDose', 'quickDoseNote', 'quickTiming', 'quickTimingNote',
            'quickFood', 'quickFoodNote', 'storage',
        ];
        const LISTS: (keyof DrugInfo)[] = [
            'commonSideEffects', 'seriousSideEffects', 'consultDoctorWhen',
        ];

        const [texts, lists] = await Promise.all([
            Promise.all(TEXT.map((field) => translateToArabic((drugInfo[field] as string) || ''))),
            Promise.all(LISTS.map((field) => translateArray((drugInfo[field] as string[]) || []))),
        ]);

        // brandName and canonicalName are deliberately left alone: a
        // transliterated brand is harder to match against the box than the
        // Latin one printed on it.
        const out: DrugInfo = { ...drugInfo };
        TEXT.forEach((field, i) => { (out[field] as unknown as string) = texts[i]; });
        LISTS.forEach((field, i) => { (out[field] as unknown as string[]) = lists[i]; });
        return out;
    } catch (error) {
        console.error('Failed to translate drug info:', error);
        return drugInfo; // Return original if translation fails
    }
};
