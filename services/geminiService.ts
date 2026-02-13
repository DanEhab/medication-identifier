import type { DrugInfo, ProfessionalDrugInfo } from '../types';
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
    const baseUrl = 'https://medication-identifier-gamma.vercel.app';
    console.log('[geminiService] Calling backend');

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

        const response = await fetch(`${baseUrl}/api/generate`, {
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
        throw new Error(`AI service error: ${error.message}`);
    }
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
        let drugInfo: DrugInfo = JSON.parse(jsonText);

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