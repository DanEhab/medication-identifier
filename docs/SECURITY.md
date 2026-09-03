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

## Rate limiting

Two limits, defending against different things:

- **Per caller, per minute** — stops one script hammering the endpoint. Counts
  every request, cached or not. Lookups and translations have separate
  allowances because an Arabic page fires roughly ten translations at once.
- **Whole app, per day** — caps what a bad day can cost. Counts only requests
  that reach Gemini, so cache hits are free and do not consume it. Once
  reached, already-cached medicines keep working; only new lookups pause.

Counters live in MongoDB, not in memory: serverless instances each hold their
own memory, so an in-memory counter is walked past by spreading requests across
instances. Documents expire on a TTL index and clean themselves up.

Caller addresses are salted and hashed before storage. A raw address is never
written to the database.

Every failure path allows the request. A broken limiter must not take the app
down with it.

Tune with `RATE_LIMIT_GENERATE_PER_MINUTE`, `RATE_LIMIT_TRANSLATE_PER_MINUTE`
and `RATE_LIMIT_PER_DAY`. Set `RATE_LIMIT_SALT` to a private value in production.

## Known gaps

- This limits abuse, not cost per user. A distributed flood from many addresses
  is capped only by the daily ceiling. Vercel's firewall in front of the
  functions would block that traffic before it ever runs.
- Patient details (name, age, diagnosis) are kept in `localStorage` and are not
  encrypted. `android:allowBackup` is `false` so they stay off cloud backups.

## If a credential leaks

1. Revoke it at the provider immediately — rotation matters more than cleanup.
2. Remove it from the working tree and commit.
3. Rewrite history only if the repository is public, and force-push.
4. Assume anything ever pushed to a public repo is compromised permanently.
