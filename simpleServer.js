// simpleServer.js - Direct API calls without SDK
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env.local
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
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('→ Responding to OPTIONS (preflight)');
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head><title>Medication API Server</title></head>
        <body style="font-family: sans-serif; padding: 20px;">
          <h1>✅ Server is running!</h1>
          <p>API endpoint: POST /api/generate</p>
          <p>Status: Ready to accept requests</p>
        </body>
      </html>
    `);
    return;
  }

  if (req.url === '/api/generate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        console.log('Request received');
        const { contents, config } = JSON.parse(body);

        // Direct API call to Gemini
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        // Format contents properly for Gemini API
        let formattedContents;
        if (typeof contents === 'string') {
          // Simple text prompt
          formattedContents = [{ parts: [{ text: contents }] }];
        } else if (Array.isArray(contents)) {
          // Already formatted or needs wrapping
          formattedContents = contents;
        } else {
          // Single content object
          formattedContents = [contents];
        }
        
        const requestBody = JSON.stringify({
          contents: formattedContents,
          generationConfig: config || {}
        });

        console.log('Calling Gemini API...');
        
        const apiReq = https.request(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(requestBody)
          }
        }, (apiRes) => {
          let data = '';
          apiRes.on('data', chunk => { data += chunk; });
          apiRes.on('end', () => {
            try {
              const response = JSON.parse(data);
              if (apiRes.statusCode === 200) {
                const text = response.candidates[0].content.parts[0].text;
                console.log('Success!');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ text }));
              } else {
                console.error('API Error:', data);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: response.error?.message || 'API Error' }));
              }
            } catch (err) {
              console.error('Parse error:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        });

        apiReq.on('error', (err) => {
          console.error('Request error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });

        apiReq.write(requestBody);
        apiReq.end();

      } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Simple server running on port ${PORT}`);
  console.log(`📱 Android emulator: http://10.0.2.2:${PORT}`);
  console.log(`💻 Localhost: http://localhost:${PORT}\n`);
});
