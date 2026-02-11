// api/generate.js
import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  // --- 1. SET CORS HEADERS (The Handshake) ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // --- 2. HANDLE PRE-FLIGHT (OPTIONS) ---
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- 3. MAIN LOGIC ---
  try {
    // Parse the body - MUST match what frontend sends: { model, contents, config }
    const { model, contents, config } = req.body || {};

    // Safety Check: Is the key actually set in Vercel?
    if (!process.env.GEMINI_API_KEY) {
      console.error("Server Error: Missing GEMINI_API_KEY");
      return res.status(500).json({ error: "Server Configuration Error: API Key missing" });
    }

    // Initialize AI with the API key
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Call the new Genai SDK with the exact structure frontend sends
    const response = await ai.models.generateContent({
      model: model || 'gemini-1.5-flash',
      contents,
      config
    });

    // Return in the format frontend expects: { text: "..." }
    return res.status(200).json({ text: response.text });

  } catch (error) {
    console.error("Detailed Server Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}