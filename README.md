# Medication Identifier

Identify a medication from a photo or by name, and get plain-language information
about its use, dosage, and side effects — in English or Arabic. A separate
professional view exposes the technical pharmacology.

Live on Google Play as `com.danehab.medicationidentifier`.

> **Not medical advice.** Information is AI-generated and may be wrong or
> incomplete. Always confirm with a pharmacist or physician.

## Stack

| Layer    | Technology                                   |
| -------- | -------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS     |
| Mobile   | Capacitor 8 (Android)                        |
| Backend  | Vercel serverless functions (`api/`)         |
| AI       | Google Gemini (`gemini-2.5-flash`)           |
| Cache    | MongoDB Atlas (optional)                     |
| i18n     | MyMemory translation API                     |

## Layout

```
src/          React app — components, context, lib, services, translations
api/          Vercel serverless functions (CommonJS)
  generate.js     Gemini proxy, caching, and the answer shapes
  suggest.js      type-ahead, read out of the cache (no AI call)
  translate.js    EN→AR translation
  db.js           MongoDB helper (no-ops when unconfigured)
  _drugInfo.js    the patient answer: schema, aliases, normalisation
  _professional.js the clinical answer: same treatment
  _identify.js    reading a name off a photograph
  _cache.js       the answer cache and its alias table
  _cacheKey.js    turning what was typed into a stable key
  _rateLimit.js   per-caller and whole-app limits
  _cors.js        shared CORS handling
test/         Tests (see below)
android/      Capacitor Android project
public/       Static pages (privacy policy, terms)
docs/         Build and release guides
```

## Running locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` from the template and add a Gemini key
   (free from [Google AI Studio](https://aistudio.google.com/app/apikey)):
   ```bash
   cp .env.example .env.local
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

Open <http://localhost:3000>. The serverless functions in `api/` run inside the
Vite dev server, so the backend works without deploying. `MONGODB_URI` is
optional — leave it blank and every lookup goes straight to Gemini.

## Environment variables

| Variable            | Required | Purpose                                                            |
| ------------------- | -------- | ------------------------------------------------------------------ |
| `GEMINI_API_KEY`    | yes      | Server-side Gemini key. Never exposed to the client.               |
| `MONGODB_URI`       | no       | Enables response caching. Omit to run without a database.          |
| `ALLOWED_ORIGINS`   | no       | Comma-separated CORS allowlist. **Set this in production.**        |
| `VITE_API_BASE_URL` | no       | Overrides the backend URL. Blank = same-origin.                    |

Set the first three in the Vercel dashboard under Settings → Environment Variables.

## Testing

Three layers, fastest first.

```bash
npm test            # API and translations — no browser, no network, seconds
npm run test:browser  # every screen in headless Chrome
npm run test:device   # the same screens on a connected Android device
```

`npm test` runs the serverless functions against a real in-memory MongoDB with
Gemini stubbed, plus a parity check on the two translation blocks. It is the one
to run on every change.

`npm run test:browser` drives the real app in headless Chrome over the Chrome
DevTools Protocol — no test framework, no browser automation dependency. It
needs a build being served:

```bash
npm run build && npm run preview   # in one terminal
npm run test:browser               # in another
```

It checks what a screenshot cannot: that the answer comes before the reference
material, that Arabic is set in an Arabic face with no letter-spacing, that
every text run in dark mode has contrast against what is actually painted
behind it.

`npm run test:device` runs the same kind of checks against the app installed on
an emulator or phone, over an adb-forwarded WebView debugger, and against the
**live** backend. It costs real Gemini calls, which is why it is separate. Build
and install the debug APK first, and have `adb` on PATH.

## Building for Android

```bash
npm run sync:android
npm run open:android
```

Release signing reads `android/keystore.properties` (git-ignored). Copy
`android/keystore.properties.example` and fill it in. See
[docs/RELEASING.md](docs/RELEASING.md).
