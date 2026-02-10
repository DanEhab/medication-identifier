<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1eINieURnMCMgKjpJ90u7X6SiuPzjLs7J

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Create a `.env` file (copy from `.env.example`) and set your `GEMINI_API_KEY`:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```
3. Run the app:
   `npm run dev`

## Deploy to Vercel

This app uses a serverless backend to securely handle API requests.

1. Install the Vercel CLI:
   `npm install -g vercel`
2. Deploy:
   `vercel`
3. Set the `GEMINI_API_KEY` environment variable in your Vercel project settings:
   - Go to your project in Vercel Dashboard
   - Navigate to Settings → Environment Variables
   - Add `GEMINI_API_KEY` with your API key

## Architecture

- **Frontend**: React + TypeScript + Vite
- **Backend**: Vercel Serverless Functions ([api/generate.js](api/generate.js))
- **AI**: Google Gemini API

The application uses a secure backend architecture where the Gemini API key is stored on the server, not exposed to the client.
