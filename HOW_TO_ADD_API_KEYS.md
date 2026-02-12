# How to Configure your Gemini API Key

## For Vercel Deployment (Production)

### Step 1: Add API Key to Vercel Dashboard

1. Go to **[Vercel Dashboard](https://vercel.com/dashboard)**
2. Select your project: **medication-identifier**
3. Go to **Settings** → **Environment Variables**
4. Add a new environment variable:
   - **Name:** `GEMINI_API_KEY`
   - **Value:** `AIzaSyAb9nvFgWx7VeRZd5GVBuJQfCQC55tLscI`
   - **Environment:** Production, Preview, and Development (check all)
5. Click **Save**

### Step 2: Redeploy

After adding the environment variable, trigger a redeployment:
- Go to **Deployments** tab
- Click the **···** menu on the latest deployment
- Click **Redeploy**

Your app will now use the **PAID** Gemini API key with **unlimited quota**!

## For Local Development

The `.env.local` file is already configured with your PAID API key.

To run locally:
```bash
npm install
npm run dev
```

## API Configuration Details

- **Model:** `gemini-1.5-flash` (high-speed, cost-effective)
- **API Key:** Configured via `process.env.GEMINI_API_KEY`
- **Security:** API key is never exposed to the frontend
- **Quota:** Unlimited (paid account)

## Troubleshooting

### If you see quota errors:

1. Verify the API key in Vercel matches: `AIzaSyAb9nvFgWx7VeRZd5GVBuJQfCQC55tLscI`
2. Check that billing is enabled in [Google Cloud Console](https://console.cloud.google.com/billing)
3. Ensure the API key is linked to the correct paid project

### To verify your API key:

1. Go to **[Google AI Studio](https://aistudio.google.com/apikey)**
2. Find the key ending in `...tLscI`
3. Confirm it's linked to your paid billing account

## Security Note

The API key is stored as an **environment variable** on Vercel's servers and is only accessible to your backend serverless functions. It's never exposed to users or included in the frontend bundle.
