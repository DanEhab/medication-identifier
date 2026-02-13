// api/generate.js - Vercel serverless function with MongoDB caching

const { connectToDatabase } = require('./db');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Extract JSON from response, handling markdown code blocks and other formatting
 */
const extractJSON = (text) => {
  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
  
  // Find the first { and track braces to find the complete JSON object
  const startIndex = cleaned.indexOf('{');
  if (startIndex === -1) {
    return cleaned;
  }
  
  let braceCount = 0;
  let endIndex = -1;
  
  for (let i = startIndex; i < cleaned.length; i++) {
    if (cleaned[i] === '{') {
      braceCount++;
    } else if (cleaned[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIndex = i;
        break;
      }
    }
  }
  
  if (endIndex !== -1) {
    return cleaned.substring(startIndex, endIndex + 1);
  }
  
  // Fallback to original logic if brace tracking fails
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : cleaned;
};

/**
 * Extract drug name from prompt text
 */
const extractDrugName = (prompt) => {
  // Pattern: "drug: DrugName" or "for the drug: DrugName"
  const match = prompt.match(/(?:drug|medication):\s*([^.,\n]+)/i);
  if (match) {
    return match[1].trim();
  }
  return null;
};

/**
 * Normalize drug name for consistent cache keys
 */
const normalizeDrugName = (drugName) => {
  if (!drugName) return null;
  return drugName.toLowerCase().trim();
};

/**
 * Determine which collection to use based on prompt content
 */
const getCollectionName = (prompt) => {
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes('patient-friendly') || lowerPrompt.includes('patient information')) {
    return 'medications';
  }
  if (lowerPrompt.includes('professional') || lowerPrompt.includes('technical') || lowerPrompt.includes('healthcare professional')) {
    return 'professional_medications';
  }
  // Default to patient-friendly
  return 'medications';
};

/**
 * Call Gemini API
 */
const callGeminiAPI = async (formattedContents, config) => {
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
    const maskedKey = GEMINI_API_KEY ? `...${GEMINI_API_KEY.slice(-6)}` : 'UNKNOWN';
    console.error('Gemini API Error:', data);
    console.error('API Key used:', maskedKey);
    throw new Error(`${data.error?.message || 'API Error'} [API Key: ${maskedKey}]`);
  }

  return data.candidates[0].content.parts[0].text;
};

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
    const { contents, config, language = 'en' } = req.body;

    // Format contents for Gemini API
    let formattedContents;
    let promptText = '';

    if (typeof contents === 'string') {
      formattedContents = [{ parts: [{ text: contents }] }];
      promptText = contents;
    } else if (Array.isArray(contents)) {
      formattedContents = contents;
      // Extract text from array format
      const textPart = contents[0]?.parts?.find(part => part.text);
      promptText = textPart?.text || '';
    } else {
      formattedContents = [contents];
      // Extract text from object format
      const textPart = contents?.parts?.find(part => part.text);
      promptText = textPart?.text || '';
    }

    // Try to extract drug name and determine if this is cacheable
    const drugName = extractDrugName(promptText);
    const normalizedName = normalizeDrugName(drugName);
    const collectionName = getCollectionName(promptText);

    // Only cache drug information requests (not image identification)
    const isCacheable = normalizedName && !promptText.toLowerCase().includes('identify the drug name');

    let cachedData = null;

    // Try to get from cache if cacheable
    if (isCacheable) {
      try {
        const { db } = await connectToDatabase();
        const collection = db.collection(collectionName);
        
        // Always check for English cache (translation happens on frontend)
        cachedData = await collection.findOne({
          normalizedName: normalizedName,
          language: 'en'
        });

        if (cachedData) {
          console.log(`[Cache HIT] ${normalizedName} (en) from ${collectionName}`);
          
          // Return data as-is if it's already an object, otherwise as text
          const responseData = typeof cachedData.data === 'object' 
            ? JSON.stringify(cachedData.data, null, 0) 
            : cachedData.data;
            
          return res.status(200).json({ 
            text: responseData,
            cached: true 
          });
        }

        console.log(`[Cache MISS] ${normalizedName} (en) in ${collectionName}`);
      } catch (dbError) {
        console.error('MongoDB error (will continue with Gemini):', dbError);
        // Continue to Gemini call even if DB fails
      }
    }

    // Call Gemini API (always in English for drug information)
    const text = await callGeminiAPI(formattedContents, config);

    // Save to cache if this was a cacheable request (always in English)
    if (isCacheable && text) {
      try {
        const { db } = await connectToDatabase();
        const collection = db.collection(collectionName);

        // Try to parse the response as JSON to validate it
        let parsedData;
        try {
          const jsonText = extractJSON(text);
          parsedData = JSON.parse(jsonText);
        } catch (parseError) {
          console.error('Failed to parse Gemini response as JSON, storing as text:', parseError);
          parsedData = text;
        }

        // Always save in English
        await collection.updateOne(
          {
            normalizedName: normalizedName,
            language: 'en'
          },
          {
            $set: {
              normalizedName: normalizedName,
              language: 'en',
              data: parsedData,
              originalName: drugName,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );

        console.log(`[Cache SAVE] ${normalizedName} (en) to ${collectionName}`);
      } catch (dbError) {
        console.error('Failed to save to MongoDB (response still returned):', dbError);
        // Don't fail the request if caching fails
      }
    }

    return res.status(200).json({ text, cached: false });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: error.message });
  }
};