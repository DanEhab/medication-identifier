// api/generate.js - Vercel serverless function with paid key priority

// Multiple API keys - PAID key gets priority, free keys as backup
const API_KEYS = [
  'AIzaSyAb9nvFgWx7VeRZd5GVBuJQfCQC55tLscI',  // PAID KEY (unlimited - always try first)
  'AIzaSyAHjBQkcO9P8vLR64hi1Tw5AJhB12nx4Z8',  // Free backup
  'AIzaSyDJ7Yp_GIkrYPpRY9hEBVYHZDC6iAK719E',  // Free backup
  'AIzaSyDyJA-cn64iiISBH3siNvLfeuCiFYztRqY',  // Free backup
  'AIzaSyA_iaXOu5tiAHMfHIOsaGgHMKRSlyLjqUQ',  // Free backup
  'AIzaSyANffwVxE9L7_UJINzPpZ0MZXJWB0AsYD0',  // Free backup
];

module.exports = async (req, res) => {
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

    // Try paid key first (unlimited), then free keys as backup
    const maxRetries = API_KEYS.length;
    let lastError = null;
    
    for (let keyIndex = 0; keyIndex < maxRetries; keyIndex++) {
      const apiKey = API_KEYS[keyIndex];
      const isPaidKey = keyIndex === 0;
      
      console.log(`Attempt ${keyIndex + 1}: Using ${isPaidKey ? 'PAID' : 'FREE'} Key`);
      
      // Call Gemini API directly
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      
      try {
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
          // Check if it's a quota error
          const isQuotaError = data.error?.message?.includes('quota') || 
                              data.error?.message?.includes('RESOURCE_EXHAUSTED') ||
                              response.status === 429;
          
          if (isQuotaError && keyIndex < maxRetries - 1) {
            // This key is exhausted, try next one
            console.log(`${isPaidKey ? 'PAID' : 'FREE'} key exhausted, trying next...`);
            lastError = data.error?.message || 'Quota exceeded';
            continue; // Try next key
          }
          
          // Not quota error or last retry - return error
          console.error('Gemini API Error:', data);
          return res.status(response.status).json({ 
            error: data.error?.message || 'API Error' 
          });
        }

        // Success - return response
        console.log(`✅ Success with ${isPaidKey ? 'PAID' : 'FREE'} Key`);
        const text = data.candidates[0].content.parts[0].text;
        return res.status(200).json({ text });
        
      } catch (fetchError) {
        console.error(`Fetch error:`, fetchError);
        lastError = fetchError.message;
        if (keyIndex < maxRetries - 1) {
          continue; // Try next key
        }
      }
    }
    
    // All keys exhausted
    return res.status(429).json({ 
      error: 'All API keys have exhausted their quotas. Please try again later.' 
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: error.message });
  }
};