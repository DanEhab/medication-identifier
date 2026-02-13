// api/translate.js - Vercel serverless function for translation using Google Translate

const { translate } = require('@vitalets/google-translate-api');

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
        text.map(async (item) => {
          try {
            const result = await translate(item, { from, to });
            return result.text;
          } catch (error) {
            console.error('Translation error for item:', error);
            return item; // Return original if translation fails
          }
        })
      );
      return res.status(200).json({ translations });
    }

    // Handle single text
    const result = await translate(text, { from, to });
    return res.status(200).json({ translation: result.text });

  } catch (error) {
    console.error('Translation error:', error);
    return res.status(500).json({ error: error.message || 'Translation failed' });
  }
};
