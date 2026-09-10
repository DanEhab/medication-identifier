# Releasing to Google Play

## One-time setup

1. Copy the signing template and fill in your keystore credentials:
   ```bash
   cp android/keystore.properties.example android/keystore.properties
   ```
   `android/keystore.properties` and `*.keystore` are both git-ignored. Keep the
   keystore file backed up somewhere outside the repo — losing it means you can
   no longer ship updates under the same upload key.

2. Store the passwords in a password manager, not in a file in the project.

## Each release

1. Bump the version in **both** places, to the same number:

   `package.json`
   ```json
   "version": "1.4.0"
   ```

   `android/app/build.gradle`
   ```gradle
   versionCode 8        // must increase every upload
   versionName "1.4.0"
   ```

   They are separate on purpose but must agree: the Play Console reads the
   Gradle one, and the app reads `package.json` at build time to decide
   whether to show the tour again. A version bumped in only one place either
   fails the upload or re-runs the tour for nobody.

2. Build the web bundle and sync it into the Android project:
   ```bash
   npm run sync:android
   ```

3. Produce a signed bundle:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   Output: `android/app/build/outputs/bundle/release/app-release.aab`

4. Upload the `.aab` in the Play Console.

## Before you ship

Run these, in this order. The first two take a couple of minutes between them.

```bash
npm test                              # API, caching, translations
npm run build && npm run preview      # then, in another terminal:
npm run test:browser                  # every screen, both languages, both themes
```

Then build and install the debug APK and run the device suite, which talks to
the live backend and so proves the deployment as well as the app:

```bash
npm run test:device
```

- [ ] `npm test` passes
- [ ] `npm run test:browser` passes
- [ ] `npm run test:device` passes against the current deployment
- [ ] `versionCode` incremented, and `package.json` matches `versionName`
- [ ] Vercel redeployed if anything under `api/` changed — the app and the API
      ship separately, and a screen expecting a field the deployed API does not
      return will render without it
- [ ] `ALLOWED_ORIGINS` is set in Vercel so the API is not open to the world
- [ ] `RATE_LIMIT_SALT` is set in Vercel to a private value
- [ ] The privacy policy still matches what the app does, and the Play Data
      Safety form still matches the privacy policy
