// api/generate.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = async (req, res) => {
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
    res.status(200).end();
    return;
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

    // Initialize AI with the older, stable SDK
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const aiModel = genAI.getGenerativeModel({ 
      model: model || 'gemini-1.5-flash'
    });

    // Generate content - but we need to adapt the request format
    let result;
    if (config && config.responseMimeType) {
      result = await aiModel.generateContent({
        contents: Array.isArray(contents) ? contents : [{ role: "user", parts: [{ text: contents }] }],
        generationConfig: config
      });
    } else {
      result = await aiModel.generateContent(
        Array.isArray(contents) ? contents : contents
      );
    }
    
    const response = await result.response;

    const response = await result.response;
    const text = response.text();

    // Return in the format frontend expects: { text: "..." }
    res.status(200).json({ text: text });

  } catch (error) {
    console.error("Detailed Server Error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
};