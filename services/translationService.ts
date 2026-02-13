import type { DrugInfo } from '../types';

const TRANSLATION_API_URL = 'https://medication-identifier-gamma.vercel.app/api/translate';

/**
 * Translate text to Arabic using our Vercel translation API
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
 */
export const translateDrugInfo = async (drugInfo: DrugInfo): Promise<DrugInfo> => {
    try {
        const [
            drugName,
            strength,
            commonUse,
            dosageAdministration,
            foodDrinkEffect,
            missedDose,
            storage,
            commonSideEffects,
            seriousSideEffects,
            consultDoctorWhen
        ] = await Promise.all([
            translateToArabic(drugInfo.drugName),
            translateToArabic(drugInfo.strength),
            translateToArabic(drugInfo.commonUse),
            translateToArabic(drugInfo.dosageAdministration),
            translateToArabic(drugInfo.foodDrinkEffect),
            translateToArabic(drugInfo.missedDose),
            translateToArabic(drugInfo.storage),
            translateArray(drugInfo.commonSideEffects),
            translateArray(drugInfo.seriousSideEffects),
            translateArray(drugInfo.consultDoctorWhen)
        ]);

        return {
            drugName,
            strength,
            commonUse,
            dosageAdministration,
            foodDrinkEffect,
            missedDose,
            commonSideEffects,
            seriousSideEffects,
            consultDoctorWhen,
            storage
        };
    } catch (error) {
        console.error('Failed to translate drug info:', error);
        return drugInfo; // Return original if translation fails
    }
};
