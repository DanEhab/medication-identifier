// api/generate.js - Vercel serverless function with PAID API key (unlimited quota)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

module.exports = async (req, res) => {
  // Validate API key is present
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable not configured' });
  }
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { contents, config } = req.body;

    // Format contents for Gemini API
    let formattedContents;
    if (typeof contents === 'string') {
      formattedContents = [{ parts: [{ text: contents }] }];
    } else if (Array.isArray(contents)) {
      formattedContents = contents;
    } else {
      formattedContents = [contents];
    }

    // Call Gemini API with paid key
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: formattedContents,
        generationConfig: config || {}
      })
    });

    const data = await response.json();

    if (!response.ok) {
      // Mask API key for security (show last 6 chars for debugging)
      const maskedKey = GEMINI_API_KEY ? `...${GEMINI_API_KEY.slice(-6)}` : 'UNKNOWN';
      console.error('Gemini API Error:', data);
      console.error('API Key used:', maskedKey);
      
      return res.status(response.status).json({ 
        error: `${data.error?.message || 'API Error'} [API Key: ${maskedKey}]`
      });
    }

    const text = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ text });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: error.message });
  }
};