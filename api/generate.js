import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
    // CORS headers - Allow requests from Capacitor apps
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // SECURITY RESTORED: Look for the key in the environment variables
        if (!process.env.GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not set');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const { model, contents, config } = req.body;

        const response = await ai.models.generateContent({
            model,
            contents,
            config
        });

        return res.status(200).json({ text: response.text });
        
    } catch (error) {
        console.error('Backend Error:', error);
        return res.status(500).json({ error: error.message });
    }
}