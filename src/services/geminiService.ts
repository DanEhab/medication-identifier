import type { DrugInfo, PackReading, ProfessionalDrugInfo, Recognition } from '../types';
import { NotAMedicationError, RateLimitedError } from '../types';
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

            // Being asked to slow down is not a fault. The server already wrote
            // a message meant for a person, so pass it straight through rather
            // than dressing it up as a service error.
            if (response.status === 429) {
                throw new RateLimitedError(
                    errorData.error || 'Please wait a moment and try again.',
                    Number(errorData.retryAfter) || 60,
                );
            }

            throw new Error(errorData.error || `Backend error: ${response.status}`);
        }

        const data = await response.json();
        return data.text;
    } catch (error: any) {
        if (error instanceof RateLimitedError) throw error;
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
    canonicalName: ['canonical_name', 'generic_name', 'genericName', 'active_ingredient', 'inn'],
    brandName: ['brand_name', 'brand', 'trade_name'],
    commonUse: ['common_use', 'common_uses', 'uses', 'indications'],
    whatItIsFor: ['what_it_is_for', 'purpose', 'summary'],
    howToTake: ['how_to_take', 'how_to_take_it'],
    dosageAdministration: ['dosage_administration', 'dosage', 'administration', 'how_much_to_take'],
    tellYourDoctorIf: ['tell_your_doctor_if', 'warning_signs'],
    neverWith: ['never_with', 'avoid_with', 'contraindications'],
    quickDose: ['quick_dose', 'dose_amount'],
    quickDoseNote: ['quick_dose_note', 'dose_frequency'],
    quickTiming: ['quick_timing', 'timing'],
    quickTimingNote: ['quick_timing_note', 'timing_note'],
    quickFood: ['quick_food', 'food_rule'],
    quickFoodNote: ['quick_food_note', 'food_note'],
    foodDrinkEffect: ['food_drink_effect', 'food_and_drink', 'food_interactions'],
    missedDose: ['missed_dose', 'if_you_miss_a_dose'],
    commonSideEffects: ['common_side_effects', 'side_effects'],
    seriousSideEffects: ['serious_side_effects', 'severe_side_effects'],
    consultDoctorWhen: ['consult_doctor_when', 'when_to_call_your_doctor', 'when_to_see_a_doctor', 'warnings'],
    storage: ['storage_instructions', 'how_to_store'],
};

const META_ALIASES: Record<string, string[]> = {
    recognition: ['recognised', 'recognized', 'result_type', 'classification', 'category'],
    identifiedAs: ['identified_as', 'what_it_is', 'explanation'],
    safetyNote: ['safety_note', 'safety_warning', 'warning'],
};

const LIST_FIELDS: (keyof DrugInfo)[] = ['commonSideEffects', 'seriousSideEffects', 'consultDoctorWhen'];

const flatten = (value: any): string[] => {
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (value === null || value === undefined) return [];
    if (typeof value === 'object') return Object.values(value).flatMap(flatten);
    return [String(value)];
};

const loose = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * "Never with" is asked for as a "·"-separated line, and the model often
 * answers with newlines or bullets instead. Left alone those collapse into an
 * unpunctuated run-on when rendered.
 */
const separatedLine = (text: string): string => {
    if (!text) return '';
    return text
        .replace(/\s*[\r\n]+\s*/g, ' · ')
        .replace(/\s*[·•‣⁃-]\s+/g, ' · ')
        .replace(/(\s*·\s*)+/g, ' · ')
        .replace(/^\s*·\s*|\s*·\s*$/g, '')
        .trim();
};

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
            const text = typeof value === 'string' ? value : flatten(value).join(' ');
            // The server does this too; repeated here because the client
            // refuses to trust the payload with the shape the UI renders.
            (out[field] as unknown as string) = field === 'neverWith' ? separatedLine(text) : text;
        }
    });

    return out;
};

const readMeta = (source: Record<string, any>, field: keyof typeof META_ALIASES): string => {
    const wanted = [field as string, ...META_ALIASES[field]].map(loose);
    for (const [key, value] of Object.entries(source)) {
        if (wanted.includes(loose(key))) return typeof value === 'string' ? value : flatten(value).join(' ');
    }
    return '';
};

const readRecognition = (source: Record<string, any>, info: DrugInfo): Recognition => {
    const stated = loose(readMeta(source, 'recognition'));
    if (stated.includes('medication') || stated.includes('medicine') || stated.includes('drug')) return 'medication';
    if (stated.includes('substance') || stated.includes('chemical') || stated.includes('poison')) return 'substance';
    if (stated) return 'unknown';

    // No classification in the payload (an entry cached before this existed):
    // fall back to whether it reads like a complete drug record.
    const lists: (keyof DrugInfo)[] = ['commonSideEffects', 'seriousSideEffects', 'consultDoctorWhen'];
    const filled = lists.filter((f) => (info[f] as string[]).length > 0).length;
    return info.drugName && info.commonUse && filled >= 2 ? 'medication' : 'unknown';
};

/**
 * Reads a photo of a pack.
 *
 * Returns what it read, how sure it is, and the near neighbours it might have
 * confused it with, so the user can confirm before anything is looked up. The
 * old version returned a bare name and the app went straight to a drug page,
 * which turned a misread label into a confident page about the wrong medicine.
 *
 * The phrase "identify the drug name" is load-bearing: the server matches on it
 * to apply the reading schema and to keep photos out of the cache.
 */
export const identifyDrugFromImage = async (
    base64Image: string,
    mimeType: string,
): Promise<PackReading> => {
    const prompt =
        'Identify the drug name, strength and pack size from this photo of a medicine package. ' +
        'Report the product name exactly as printed, say how confident you are, and list up to ' +
        'three other products it could plausibly be. Return ONLY the JSON object.';

    const text = await callBackend(prompt, 'en', base64Image, mimeType);

    let reading: PackReading;
    try {
        reading = JSON.parse(extractJSON(text)) as PackReading;
    } catch {
        throw new Error('Could not read that photo. Please try again with a clearer picture.');
    }

    if (!reading?.recognised || !reading.readAs) {
        throw new Error('Could not find a medicine in that photo. Try to fill the frame with the front of the pack.');
    }

    return {
        recognised: true,
        readAs: reading.readAs,
        strengthAndPack: reading.strengthAndPack || '',
        confidence: reading.confidence || 'low',
        alternatives: Array.isArray(reading.alternatives) ? reading.alternatives : [],
    };
};

export interface LookupOptions {
    /**
     * The person has been told this is not a medicine and says otherwise.
     * Asks again, saying so — a pack name the model did not recognise the
     * first time is often recognised when it is told one exists. It does not
     * force an answer: something that is genuinely not a medicine is still
     * refused, which is the whole point of the check.
     */
    insist?: boolean;
}

export const fetchDrugInformation = async (
    drugName: string,
    language: 'en' | 'ar',
    options: LookupOptions = {},
): Promise<DrugInfo> => {
    const insistence = options.insist
        ? ' The person searching says this IS a medicine sold under this name, and a previous answer said it was not.'
        + ' Check again carefully for a brand, generic or regional pack name that matches, including common misspellings.'
        + ' If it genuinely is not a medicine, say so again rather than inventing one.'
        : '';

    // The server pins the exact response schema; this says what the fields are
    // for, so the two do not drift apart.
    const prompt = `Provide patient-friendly information for the drug: ${drugName}. Lead with one plain sentence saying what it does for the person taking it ("whatItIsFor"), the usual dose, timing and whether food matters ("quickDose"/"quickTiming"/"quickFood" and their notes), how to take it and what to do about a missed dose ("howToTake"), the one symptom that should send them to a doctor ("tellYourDoctorIf"), and anything it must never be taken with ("neverWith"). The information should be simple, clear, and based on reliable sources like the FDA and MedlinePlus. Return ONLY the JSON object, no additional text.${insistence}`;
    
    // Always fetch in English (caching is in English)
    const text = await callBackend(prompt, 'en');
    
    try {
        // Extract JSON from response
        const jsonText = extractJSON(text);
        const parsed = JSON.parse(jsonText);
        let drugInfo: DrugInfo = normalizeDrugInfo(parsed);

        // Refuse to render a drug page for something that is not a drug. The
        // model used to happily describe a banana as a medication, complete
        // with invented side effects.
        const recognition = readRecognition(
            parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {},
            drugInfo,
        );
        if (recognition !== 'medication') {
            throw new NotAMedicationError({
                recognition,
                query: drugName,
                identifiedAs: readMeta(parsed || {}, 'identifiedAs'),
                safetyNote: readMeta(parsed || {}, 'safetyNote'),
            });
        }

        // If Arabic requested, translate using Google Translate
        if (language === 'ar') {
            drugInfo = await translateDrugInfo(drugInfo);
        }
        
        return drugInfo;
    } catch (e) {
        if (e instanceof NotAMedicationError) throw e;
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