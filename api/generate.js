// api/generate.js - BARE BONES VERSION FOR TESTING

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // For now, return a simple response
  return res.status(200).json({ 
    text: "Backend is working! Google AI will be re-enabled once this works.",
    method: req.method,
    hasApiKey: !!process.env.GEMINI_API_KEY
  });
};