// api/generate.js
// Temporarily disabled: const { GoogleGenerativeAI } = require("@google/generative-ai");

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

  // --- 3. TEMPORARY SIMPLE RESPONSE ---
  try {
    return res.status(200).json({ 
      text: "BASIC ENDPOINT WORKING - Google AI temporarily disabled for testing",
      hasApiKey: !!process.env.GEMINI_API_KEY
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
};