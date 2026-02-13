// api/translate.js - Vercel serverless function for translation using MyMemory API

/**
 * Split text into chunks of max 500 characters (MyMemory limit)
 * Tries to split at sentence boundaries to maintain context
 */
function splitTextIntoChunks(text, maxLength = 450) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  const sentences = text.split(/([.!?]\s+)/); // Split but keep delimiters
  let currentChunk = '';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        // Single sentence is too long, force split
        chunks.push(sentence.substring(0, maxLength).trim());
        currentChunk = sentence.substring(maxLength);
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Translate text using MyMemory Translation API
 * Free tier: 10,000 words/day, no authentication required, very reliable
 * Limit: 500 chars per request
 */
async function translateText(text, from = 'en', to = 'ar') {
  try {
    // Handle empty or very short text
    if (!text || text.trim().length === 0) {
      return text;
    }

    // Split long text into chunks
    const chunks = splitTextIntoChunks(text, 450);
    
    if (chunks.length === 1) {
      // Single chunk - simple translation
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        return data.responseData.translatedText;
      }
      
      console.warn('Translation returned no result:', data);
      return text;
    }

    // Multiple chunks - translate each and combine
    const translatedChunks = [];
    for (const chunk of chunks) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${from}|${to}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        translatedChunks.push(data.responseData.translatedText);
      } else {
        console.warn('Chunk translation failed, using original:', data);
        translatedChunks.push(chunk);
      }
      
      // Small delay between chunks to avoid rate limiting
      if (chunks.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return translatedChunks.join(' ');
  } catch (error) {
    console.error('Translation error:', error);
    return text; // Return original if translation fails
  }
}

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
    const { text, from = 'en', to = 'ar' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Handle arrays of text
    if (Array.isArray(text)) {
      const translations = await Promise.all(
        text.map(item => translateText(item, from, to))
      );
      return res.status(200).json({ translations });
    }

    // Handle single text
    const translation = await translateText(text, from, to);
    return res.status(200).json({ translation });

  } catch (error) {
    console.error('Translation error:', error);
    return res.status(500).json({ error: error.message || 'Translation failed' });
  }
};
