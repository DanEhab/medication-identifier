import { Type } from "@google/genai";
import type { DrugInfo, ProfessionalDrugInfo } from '../types';
import { CapacitorHttp } from '@capacitor/core';

/**
 * Helper function to call the backend serverless function
 */
const callBackend = async (model: string, contents: any, config?: any): Promise<string> => {
const baseUrl = 'https://medication-identifier-gamma.vercel.app';
console.log('[geminiService] Calling backend:', baseUrl);
console.log('[geminiService] Payload:', { model, contents: typeof contents, config });

const response = await CapacitorHttp.post({
        url: `${baseUrl}/api/generate`,
        headers: {
            'Content-Type': 'application/json',
        },
        data: {
            model,
            contents,
            config
        }
    });

    console.log('[geminiService] Response status:', response.status);
    
    if (response.status !== 200) {
        const errorData = response.data || { error: 'Unknown error' };
        console.error('[geminiService] Error response:', errorData);
        throw new Error(errorData.message || errorData.error || 'Backend request failed');
    }

    console.log('[geminiService] Success! Got response');
    return response.data.text;
};

const drugInfoSchema = {
    type: Type.OBJECT,
    properties: {
        drugName: { type: Type.STRING, description: "The full name of the drug, including brand name if common." },
        strength: { type: Type.STRING, description: "The strength of the medication, e.g., '500 mg'." },
        commonUse: { type: Type.STRING, description: "A brief, easy-to-understand description of what this medication is used for." },
        dosageAdministration: { type: Type.STRING, description: "Simple instructions on how to take the medication, e.g., 'Take one tablet by mouth twice a day'." },
        foodDrinkEffect: { type: Type.STRING, description: "Instructions on whether to take with food, and any food/drinks to avoid." },
        missedDose: { type: Type.STRING, description: "Clear instructions on what to do if a dose is missed." },
        commonSideEffects: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of common, less severe side effects."
        },
        seriousSideEffects: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of serious side effects that require immediate medical attention."
        },
        consultDoctorWhen: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of specific situations when the user should consult their doctor or pharmacist."
        },
        storage: { type: Type.STRING, description: "Instructions on how to store the medication properly." }
    },
    required: [
        "drugName", "strength", "commonUse", "dosageAdministration", "foodDrinkEffect",
        "missedDose", "commonSideEffects", "seriousSideEffects", "consultDoctorWhen", "storage"
    ]
};


export const identifyDrugFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
    const text = await callBackend(
        'gemini-2.5-flash',
        {
            parts: [
                {
                    inlineData: {
                        mimeType,
                        data: base64Image,
                    },
                },
                {
                    text: 'Identify the drug name, strength, and form from this image. Provide only the name and strength, for example: "Amoxicillin 500mg". If you cannot identify it, say "Unknown".',
                },
            ],
        }
    );

    const trimmedText = text.trim();
    if (trimmedText.toLowerCase() === 'unknown') {
        throw new Error('Could not identify the drug from the image. Please try again with a clearer picture.');
    }
    return trimmedText;
};

const translateDrugInfo = async (drugInfo: DrugInfo): Promise<DrugInfo> => {
    const prompt = `Translate the following JSON object's string values into simple, understandable Egyptian layperson Arabic. Do not translate the JSON keys. Keep the exact same structure and types (string arrays should remain string arrays). Return ONLY the translated JSON object. Original English JSON: ${JSON.stringify(drugInfo, null, 2)}`;
    
    const text = await callBackend(
        'gemini-2.5-flash',
        prompt,
        {
            responseMimeType: 'application/json',
            responseSchema: drugInfoSchema
        }
    );

    try {
        const translatedInfo: DrugInfo = JSON.parse(text);
        return translatedInfo;
    } catch (e) {
        console.error("Failed to parse translated JSON from Gemini, returning original English text.", e);
        // Fallback to English if translation fails
        return drugInfo;
    }
};

export const fetchDrugInformation = async (drugName: string, language: 'en' | 'ar'): Promise<DrugInfo> => {
    const text = await callBackend(
        'gemini-2.5-flash',
        `Provide patient-friendly information for the drug: ${drugName}. Please format the output as a JSON object adhering to the provided schema. The information should be simple, clear, and based on reliable sources like the FDA and MedlinePlus.`,
        {
            responseMimeType: 'application/json',
            responseSchema: drugInfoSchema
        }
    );
    
    try {
        let drugInfo: DrugInfo = JSON.parse(text);

        if (language === 'ar') {
            drugInfo = await translateDrugInfo(drugInfo);
        }
        
        return drugInfo;
    } catch (e) {
        console.error("Failed to parse JSON response from Gemini:", e);
        throw new Error("Failed to retrieve structured drug information. The model may have returned an invalid format.");
    }
};

export const fetchProfessionalDrugInformation = async (drugName: string): Promise<ProfessionalDrugInfo> => {
    const text = await callBackend(
        'gemini-2.5-flash',
        `Provide detailed technical information for the drug: ${drugName}, intended for a healthcare professional. Include sections on chemistry, its BCS class, pharmacology, pharmacokinetics, mechanism of action, adverse effects, and drug interactions. Finally, provide a list of references or sources used to compile this information. Format the output as a JSON object. Use reliable sources like medical journals, FDA documentation, and pharmacology databases.`,
        {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    chemistry: { type: Type.STRING, description: "Description of the drug's chemical structure, class, and properties." },
                    bcsClass: { type: Type.STRING, description: "The Biopharmaceutics Classification System (BCS) class of the drug (e.g., 'Class I', 'Class II')." },
                    pharmacology: { type: Type.STRING, description: "Detailed explanation of the drug's pharmacological effects on the body." },
                    pharmacokinetics: { type: Type.STRING, description: "Information on the absorption, distribution, metabolism, and excretion (ADME) of the drug." },
                    mechanismOfAction: { type: Type.STRING, description: "The specific biochemical interaction through which a drug substance produces its pharmacological effect." },
                    adverseEffects: { type: Type.STRING, description: "A comprehensive summary of potential adverse effects, beyond the common ones." },
                    drugInteractions: { type: Type.STRING, description: "Known significant drug-drug or drug-food interactions." },
                    references: { type: Type.STRING, description: "A list of sources and references used for the information, separated by newlines." }
                },
                required: ["chemistry", "bcsClass", "pharmacology", "pharmacokinetics", "mechanismOfAction", "adverseEffects", "drugInteractions", "references"]
            }
        }
    );

    try {
        const profInfo: ProfessionalDrugInfo = JSON.parse(text);
        return profInfo;
    } catch (e) {
        console.error("Failed to parse professional JSON response from Gemini:", e);
        throw new Error("Failed to retrieve structured professional drug information.");
    }
};