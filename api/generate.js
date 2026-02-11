import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  // --- START OF CORS FIX ---
  // 1. Allow connections from ANYWHERE (including your mobile app)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allow any origin
  
  // 2. Allow these specific types of requests
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 3. If the browser/app is just asking "Can I connect?", say YES (200 OK) and stop.
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  // --- END OF CORS FIX ---

  // ... The rest of your existing code stays exactly the same below ...
  const { model, prompt, image } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Missing API Key" });
  }

  try {
    const aiModel = genAI.getGenerativeModel({ model: model || 'gemini-1.5-flash' });

    let result;
    if (image) {
      // Image mode
      const imageParts = [
        {
          inlineData: {
            data: image,
            mimeType: "image/jpeg", // Adjust if you support other formats
          },
        },
      ];
      result = await aiModel.generateContent([prompt, ...imageParts]);
    } else {
      // Text mode
      result = await aiModel.generateContent(prompt);
    }

    const response = await result.response;
    const text = response.text();
    
    // Send the actual answer back
    res.status(200).json(text);

  } catch (error) {
    console.error("Error generating content:", error);
    res.status(500).json({ error: error.message || "Failed to generate content" });
  }
}