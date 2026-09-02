import type { DrugInfo, ProfessionalDrugInfo } from '../types';
import { API_BASE_URL } from '../config';
import { translateDrugInfo } from './translationService';

/**
 * Extract JSON from response, handling markdown code blocks and other formatting
 */
const extractJSON = (text: string): string => {
    // Remove markdown code blocks (```json ... ``` or ``` ... ```)
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
    
    // Find the first { and track braces to find the complete JSON object
    const startIndex = cleaned.indexOf('{');
    if (startIndex === -1) {
        return cleaned;
    }
    
    let braceCount = 0;
    let endIndex = -1;
    
    for (let i = startIndex; i < cleaned.length; i++) {
        if (cleaned[i] === '{') {
            braceCount++;
        } else if (cleaned[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                endIndex = i;
                break;
            }
        }
    }
    
    if (endIndex !== -1) {
        return cleaned.substring(startIndex, endIndex + 1);
    }
    
    // Fallback to original logic if brace tracking fails
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    return jsonMatch ? jsonMatch[0] : cleaned;
};

/**
 * Call Vercel backend with Gemini API
 */
const callBackend = async (prompt: string, language: 'en' | 'ar' = 'en', image?: string, mimeType?: string): Promise<string> => {
    try {
        let contents;
        
        if (image) {
            contents = {
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType || 'image/jpeg',
                            data: image
                        }
                    },
                    { text: prompt }
                ]
            };
        } else {
            contents = prompt;
        }

        const response = await fetch(`${API_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents,
                config: {},
                language
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Backend error: ${response.status}`);
        }

        const data = await response.json();
        return data.text;
    } catch (error: any) {
        console.error('[geminiService] Error:', error);
        
        // Friendly error messages
        if (error.message.includes('fetch') || error.message.includes('network')) {
            throw new Error('Cannot connect to server. Please check your internet connection and try again.');
        }
        if (error.message.includes('timeout')) {
            throw new Error('Request timed out. Please check your internet connection and try again.');
        }
        
        throw new Error(`Service error: ${error.message}`);
    }
};


/** Field names the model has been seen to substitute for the ones we ask for. */
const FIELD_ALIASES: Record<keyof DrugInfo, string[]> = {
    drugName: ['drug_name', 'name', 'medication_name'],
    strength: ['dose', 'dosage_strength'],
    commonUse: ['common_use', 'common_uses', 'what_it_is_for', 'uses', 'indications'],
    dosageAdministration: ['dosage_administration', 'how_to_take_it', 'dosage', 'administration'],
    foodDrinkEffect: ['food_drink_effect', 'food_and_drink', 'food_interactions'],
    missedDose: ['missed_dose', 'if_you_miss_a_dose'],
    commonSideEffects: ['common_side_effects', 'side_effects'],
    seriousSideEffects: ['serious_side_effects', 'severe_side_effects'],
    consultDoctorWhen: ['consult_doctor_when', 'when_to_call_your_doctor', 'when_to_see_a_doctor', 'warnings'],
    storage: ['storage_instructions', 'how_to_store'],
};

const LIST_FIELDS: (keyof DrugInfo)[] = ['commonSideEffects', 'seriousSideEffects', 'consultDoctorWhen'];

const flatten = (value: any): string[] => {
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (value === null || value === undefined) return [];
    if (typeof value === 'object') return Object.values(value).flatMap(flatten);
    return [String(value)];
};

const loose = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const pickField = (source: Record<string, any>, field: keyof DrugInfo): any => {
    const wanted = [field as string, ...FIELD_ALIASES[field]].map(loose);
    for (const [key, value] of Object.entries(source)) {
        if (wanted.includes(loose(key))) return value;
    }
    return undefined;
};

/**
 * Guarantees the shape ResultsScreen renders. The server normalises too, but a
 * missing array here means .map() throws and the whole app unmounts to a blank
 * screen, so the client refuses to trust the payload.
 */
const normalizeDrugInfo = (raw: any): DrugInfo => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = {} as DrugInfo;

    (Object.keys(FIELD_ALIASES) as (keyof DrugInfo)[]).forEach((field) => {
        const value = pickField(source, field);
        if (LIST_FIELDS.includes(field)) {
            (out[field] as unknown as string[]) = flatten(value).map((s) => s.trim()).filter(Boolean);
        } else {
            (out[field] as unknown as string) =
                typeof value === 'string' ? value : flatten(value).join(' ');
        }
    });

    return out;
};

export const identifyDrugFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const prompt = 'Identify the drug name, strength, and form from this image. Provide only the name and strength, for example: "Amoxicillin 500mg". If you cannot identify it, say "Unknown".';
    
    const text = await callBackend(prompt, 'en', base64Image, mimeType);

    const trimmedText = text.trim();
    if (trimmedText.toLowerCase() === 'unknown') {
        throw new Error('Could not identify the drug from the image. Please try again with a clearer picture.');
    }
    return trimmedText;
};

export const fetchDrugInformation = async (drugName: string, language: 'en' | 'ar'): Promise<DrugInfo> => {
    const prompt = `Provide patient-friendly information for the drug: ${drugName}. Please format the output as a JSON object with these exact keys: "drugName", "strength", "commonUse", "dosageAdministration", "foodDrinkEffect", "missedDose", "commonSideEffects" (array), "seriousSideEffects" (array), "consultDoctorWhen" (array), "storage". The information should be simple, clear, and based on reliable sources like the FDA and MedlinePlus. Return ONLY the JSON object, no additional text.`;
    
    // Always fetch in English (caching is in English)
    const text = await callBackend(prompt, 'en');
    
    try {
        // Extract JSON from response
        const jsonText = extractJSON(text);
        let drugInfo: DrugInfo = normalizeDrugInfo(JSON.parse(jsonText));

        // If Arabic requested, translate using Google Translate
        if (language === 'ar') {
            drugInfo = await translateDrugInfo(drugInfo);
        }
        
        return drugInfo;
    } catch (e) {
        console.error("Failed to parse JSON response:", e);
        console.error("Raw response:", text);
        throw new Error("Failed to retrieve structured drug information. The model may have returned an invalid format.");
    }
};

export const fetchProfessionalDrugInformation = async (drugName: string): Promise<ProfessionalDrugInfo> => {
    const prompt = `Provide detailed technical information for the drug: ${drugName}, intended for a healthcare professional. Format the output as a JSON object with these EXACT keys:

{
  "chemistry": "Chemical composition and structure",
  "bcsClass": "BCS Classification",
  "pharmacology": "Pharmacological properties",
  "pharmacokinetics": "ADME properties",
  "mechanismOfAction": "How the drug works",
  "adverseEffects": "Adverse effects (can be string, array, or object)",
  "drugInteractions": "Drug interactions (can be string, array, or object)",
  "references": "Sources consulted (array of strings or single string)"
}

Use reliable medical sources. Return ONLY the JSON object, no additional text.`;
    
    const text = await callBackend(prompt, 'en');
    
    try {
        // Extract JSON from response
        const jsonText = extractJSON(text);
        const profInfo: ProfessionalDrugInfo = JSON.parse(jsonText);
        return profInfo;
    } catch (e) {
        console.error("Failed to parse professional JSON response:", e);
        console.error("Raw response:", text);
        throw new Error("Failed to retrieve structured professional drug information.");
    }
};