// localServer.js - Run API locally for testing
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
}

const server = http.createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/api/generate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        console.log('Received request:', body);
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const { model, contents, config } = JSON.parse(body);
        
        if (!process.env.GEMINI_API_KEY) {
          throw new Error('GEMINI_API_KEY not found in environment');
        }
        
        console.log('Calling Google AI...');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const aiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

        // Convert contents to proper format if it's a simple string
        let formattedContents = contents;
        if (typeof contents === 'string') {
          formattedContents = [{ role: "user", parts: [{ text: contents }] }];
        }

        let result;
        if (config && config.responseMimeType) {
          result = await aiModel.generateContent({
            contents: formattedContents,
            generationConfig: config
          });
        } else {
          // Use simple string prompt if contents is just text
          if (typeof contents === 'string') {
            result = await aiModel.generateContent(contents);
          } else {
            result = await aiModel.generateContent(formattedContents);
          }
        }

        const response = await result.response;
        console.log('Success!');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: response.text() }));
      } catch (error) {
        console.error('Error in /api/generate:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Local API server running!`);
  console.log(`\n📱 For Android Emulator, use: http://10.0.2.2:${PORT}`);
  console.log(`💻 For browser/testing, use: http://localhost:${PORT}\n`);
});
