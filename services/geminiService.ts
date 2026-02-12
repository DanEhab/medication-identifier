import type { DrugInfo, ProfessionalDrugInfo } from '../types';

/**
 * Call Vercel backend with Gemini API
 */
const callBackend = async (prompt: string, image?: string, mimeType?: string): Promise<string> => {
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
                config: {}
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
    
    const text = await callBackend(prompt, base64Image, mimeType);

    const trimmedText = text.trim();
    if (trimmedText.toLowerCase() === 'unknown') {
        throw new Error('Could not identify the drug from the image. Please try again with a clearer picture.');
    }
    return trimmedText;
};

const translateDrugInfo = async (drugInfo: DrugInfo): Promise<DrugInfo> => {
    const prompt = `Translate the following JSON object's string values into simple, understandable Egyptian layperson Arabic. Do not translate the JSON keys. Keep the exact same structure and types (string arrays should remain string arrays). Return ONLY the translated JSON object, nothing else. Original English JSON:\n\n${JSON.stringify(drugInfo, null, 2)}`;
    
    const text = await callBackend(prompt);

    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : text;
        const translatedInfo: DrugInfo = JSON.parse(jsonText);
        return translatedInfo;
    } catch (e) {
        console.error("Failed to parse translated JSON, returning original English text.", e);
        return drugInfo;
    }
};

export const fetchDrugInformation = async (drugName: string, language: 'en' | 'ar'): Promise<DrugInfo> => {
    const prompt = `Provide patient-friendly information for the drug: ${drugName}. Please format the output as a JSON object with these exact keys: "drugName", "strength", "commonUse", "dosageAdministration", "foodDrinkEffect", "missedDose", "commonSideEffects" (array), "seriousSideEffects" (array), "consultDoctorWhen" (array), "storage". The information should be simple, clear, and based on reliable sources like the FDA and MedlinePlus. Return ONLY the JSON object, no additional text.`;
    
    const text = await callBackend(prompt);
    
    try {
        // Extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : text;
        let drugInfo: DrugInfo = JSON.parse(jsonText);

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
    const prompt = `Provide detailed technical information for the drug: ${drugName}, intended for a healthcare professional. Include sections on chemistry, its BCS class, pharmacology, pharmacokinetics, mechanism of action, adverse effects, and drug interactions. Finally, provide a list of references or sources used to compile this information. Format the output as a JSON object with these exact keys: "chemistry", "bcsClass", "pharmacology", "pharmacokinetics", "mechanismOfAction", "adverseEffects", "drugInteractions", "references". Use reliable sources like medical journals, FDA documentation, and pharmacology databases. Return ONLY the JSON object, no additional text.`;
    
    const text = await callBackend(prompt);
    
    try {
        // Extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : text;
        const profInfo: ProfessionalDrugInfo = JSON.parse(jsonText);
        return profInfo;
    } catch (e) {
        console.error("Failed to parse professional JSON response:", e);
        console.error("Raw response:", text);
        throw new Error("Failed to retrieve structured professional drug information.");
    }
};