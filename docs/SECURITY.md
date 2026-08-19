# Security notes

## Secrets

Nothing secret belongs in this repository. `.gitignore` blocks `.env*`,
`*.keystore`, `*.jks`, `*.p12`, `*.pem`, `*.key`, and `keystore.properties`.

Runtime configuration lives in environment variables:

- **Local**: `.env.local` (git-ignored)
- **Production**: Vercel → Settings → Environment Variables

The Gemini key is only ever read server-side in `api/generate.js`. It is never
sent to the browser or bundled into the Android app.

## API surface

`api/_cors.js` reads `ALLOWED_ORIGINS`. When it is unset the API accepts any
origin, which is fine locally but means anyone can spend your Gemini quota in
production. Set it to your own domains before deploying.

Error responses return generic messages; provider details are logged
server-side only.

## Known gaps

- No rate limiting. A determined caller can still exhaust the Gemini quota from
  an allowed origin. Consider Vercel's firewall or a per-IP limit.
- Patient details (name, age, diagnosis) are kept in `localStorage` and are not
  encrypted. `android:allowBackup` is `false` so they stay off cloud backups.

## If a credential leaks

1. Revoke it at the provider immediately — rotation matters more than cleanup.
2. Remove it from the working tree and commit.
3. Rewrite history only if the repository is public, and force-push.
4. Assume anything ever pushed to a public repo is compromised permanently.
