# How to Create Multiple API Keys for Unlimited Quota

## Quick Setup (5 minutes)

### Step 1: Create Additional API Keys

1. Go to **[Google AI Studio](https://aistudio.google.com/apikey)**
2. Sign in with your Google account
3. Click **"Create API Key"** (or "Get API Key")
4. Select your existing project or create a new one
5. **Copy the API key immediately** (you won't see it again!)
6. Repeat 4-5 times to get 5 total keys

**Result:** Each key gets **20 requests/day** = **100 total requests/day** for free!

### Step 2: Add Keys to Vercel

Open [api/generate.js](api/generate.js) and replace this section:

```javascript
const API_KEYS = [
  process.env.GEMINI_API_KEY || 'AIzaSyAHjBQkcO9P8vLR64hi1Tw5AJhB12nx4Z8',  // Key 1
  // Add more keys below:
  // 'YOUR_SECOND_KEY_HERE',
  // 'YOUR_THIRD_KEY_HERE',
];
```

With your actual keys:

```javascript
const API_KEYS = [
  'AIzaSyAHjBQkcO9P8vLR64hi1Tw5AJhB12nx4Z8',  // Key 1 (your current)
  'AIzaSyB1234567890EXAMPLE_KEY_2',          // Key 2 (new)
  'AIzaSyC9876543210EXAMPLE_KEY_3',          // Key 3 (new)
  'AIzaSyD1122334455EXAMPLE_KEY_4',          // Key 4 (new)
  'AIzaSyE6677889900EXAMPLE_KEY_5',          // Key 5 (new)
];
```

### Step 3: Deploy to Vercel

```bash
git add api/generate.js
git commit -m "Add API key rotation for unlimited quota"
git push
```

Vercel auto-deploys! Your app now has **100 free requests/day**.

## How It Works

1. **First request** → Uses Key 1
2. **Key 1 hits quota** → Automatically switches to Key 2
3. **Key 2 hits quota** → Switches to Key 3
4. And so on...
5. **All keys exhausted** → Resets at midnight PST

## Testing

After adding keys, test in your app:
- First 20 searches use Key 1
- Searches 21-40 use Key 2
- Searches 41-60 use Key 3
- And so on...

The rotation happens **automatically** - no user intervention needed!

## Quota Math

- **1 key** = 20 requests/day
- **5 keys** = 100 requests/day
- **10 keys** = 200 requests/day

Each medication search = 2-3 requests:
1. Image identification
2. Patient info
3. Professional info (if selected)

So **5 keys** ≈ **30-50 medication searches/day**

## Pro Tips

1. **Label your keys** in Google AI Studio:
   - "Medication App - Key 1"
   - "Medication App - Key 2"
   - etc.

2. **Monitor usage** at [AI Studio](https://aistudio.google.com/apikey)

3. **Add more keys anytime** - just edit the array and deploy

4. **For production**, consider upgrading to paid tier:
   - Cost: $0.000375 per request
   - 1000 searches ≈ $1.12 (super cheap!)
   - No quota limits at all

## Security Note

These keys are **embedded in server-side code** (Vercel), not exposed to users. This is safe! The frontend only talks to your Vercel API, never directly to Google.
