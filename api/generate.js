import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Check if API key is configured
        if (!process.env.GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY is not set');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Initialize the AI client with the API key from environment variables
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        // Extract parameters from request body
        const { model, contents, config } = req.body;

        // Validate required parameters
        if (!model || !contents) {
            return res.status(400).json({ error: 'Missing required parameters: model and contents are required' });
        }

        // Call the Gemini API
        const response = await ai.models.generateContent({
            model,
            contents,
            config
        });

        // Return the generated text to the client
        return res.status(200).json({ text: response.text });
        
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        
        // Return a user-friendly error message
        return res.status(500).json({ 
            error: 'Failed to generate content',
            message: error.message || 'Unknown error occurred'
        });
    }
}
