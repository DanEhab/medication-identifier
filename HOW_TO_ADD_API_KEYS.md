# How to Configure your Gemini API Key

## 🔐 Security First

**IMPORTANT:** Never commit API keys or secrets to version control. All secrets should be stored in environment variables.

## For Vercel Deployment (Production)

### Step 1: Add API Key to Vercel Dashboard

1. Go to **[Vercel Dashboard](https://vercel.com/dashboard)**
2. Select your project: **medication-identifier**
3. Go to **Settings** → **Environment Variables**
4. Add a new environment variable:
   - **Name:** `GEMINI_API_KEY`
   - **Value:** `[YOUR_ACTUAL_API_KEY]` ⚠️ Use your own API key from Google AI Studio
   - **Environment:** Production, Preview, and Development (check all)
5. Click **Save**

### Step 2: (Optional) Add MongoDB URI

If you want to use MongoDB caching:
1. Add another environment variable:
   - **Name:** `MONGODB_URI`
   - **Value:** `[YOUR_MONGODB_CONNECTION_STRING]`
   - **Environment:** Production, Preview, and Development (check all)

### Step 3: Redeploy

After adding the environment variables, trigger a redeployment:
- Go to **Deployments** tab
- Click the **···** menu on the latest deployment
- Click **Redeploy**

## For Local Development

### Step 1: Copy the environment template

```bash
cp .env.example .env.local
```

### Step 2: Edit `.env.local` with your actual API keys

1. Get your Gemini API key from **[Google AI Studio](https://aistudio.google.com/app/apikey)**
2. Open `.env.local` and replace `your_api_key_here` with your actual API key
3. (Optional) Add your MongoDB connection string if using caching

### Step 3: Run the app

```bash
npm install
npm run dev
```

⚠️ **Never commit `.env.local` to Git** - it's already in `.gitignore`

## API Configuration Details

- **Model:** `gemini-2.5-flash` (high-speed, cost-effective)
- **API Key:** Configured via `process.env.GEMINI_API_KEY`
- **Security:** API key is never exposed to the frontend - all API calls go through backend
- **Caching:** Optional MongoDB caching for improved performance

## Troubleshooting

### If you see "API Key not configured" errors:

1. Verify you've set `GEMINI_API_KEY` in:
   - Vercel Dashboard (for production)
   - `.env.local` file (for local development)
2. Check that billing is enabled in [Google Cloud Console](https://console.cloud.google.com/billing)
3. Ensure the API key is valid and has the Generative Language API enabled

### To get a new API key:

1. Go to **[Google AI Studio](https://aistudio.google.com/app/apikey)**
2. Click **Create API Key**
3. Copy the key and add it to your environment variables

### If MongoDB caching isn't working:

1. Verify your `MONGODB_URI` is correctly formatted
2. Check MongoDB Atlas network access allows your IP/vercel IPs
3. Verify database user has read/write permissions

## Security Architecture

✅ **Secure:**
- API keys stored as environment variables
- Never exposed to frontend/client code
- All API calls proxied through backend functions
- `.env.local` is git-ignored
- `.env.example` contains no real secrets

❌ **Never do this:**
- Commit `.env.local` to Git
- Hardcode API keys in source code
- Expose API keys in frontend/client code
- Share API keys in documentation or screenshots
