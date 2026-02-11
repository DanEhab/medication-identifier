// api/generate.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access the API key safely
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
    // Parse the body safely
    const { model, prompt, image } = req.body || {};

    // Safety Check: Is the key actually set in Vercel?
    if (!process.env.GEMINI_API_KEY) {
      console.error("Server Error: Missing GEMINI_API_KEY");
      return res.status(500).json({ error: "Server Configuration Error: API Key missing" });
    }

    // Select Model (Defaulting to 1.5 Flash if not specified)
    const aiModel = genAI.getGenerativeModel({ model: model || 'gemini-1.5-flash' });

    let result;
    if (image) {
      const imageParts = [
        {
          inlineData: {
            data: image,
            mimeType: "image/jpeg",
          },
        },
      ];
      result = await aiModel.generateContent([prompt, ...imageParts]);
    } else {
      result = await aiModel.generateContent(prompt);
    }

    const response = await result.response;
    const text = response.text();
    
    res.status(200).json(text);

  } catch (error) {
    console.error("Detailed Server Error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
};