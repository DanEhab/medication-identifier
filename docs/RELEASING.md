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
   "version": "1.5.0"
   ```

   `android/app/build.gradle`
   ```gradle
   versionCode 9        // must increase every upload
   versionName "1.5.0"
   ```

   They are separate on purpose but must agree: the Play Console reads the
   Gradle one, and the app reads `package.json` at build time to decide
   whether to show the tour again. A version bumped in only one place either
   fails the upload or re-runs the tour for nobody.

   The test harnesses read that same `package.json` value, so bumping it is
   enough — nothing in `test/` needs editing. It used to, and a release
   consequently failed two thousand browser assertions for no reason.

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

Check the live database is healthy and bounded — this reads only, unless you
pass `--fix`:

```bash
npm run audit:db
```

### The upgrade path

Everything above installs onto whatever is already on the emulator, which is
usually the build you just replaced — so it never asks the question that
matters most for a published app: **does an existing user keep their data?**

Saved medicines, the people they belong to, reminder times and notes, and the
chosen language and theme all live in the WebView's storage and exist nowhere
else. Run this around the install, not after it:

```bash
bash test/device/relaunch.sh
node tools/upgradeCheck.mjs write
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
bash test/device/relaunch.sh
node tools/upgradeCheck.mjs read
```

It should report all green, and note that the tour and disclaimer stamps are
still the *old* version — that is what makes them show again, which is
intended.

- [ ] `npm test` passes
- [ ] `npm run test:browser` passes
- [ ] `npm run test:device` passes against the current deployment
- [ ] `npm run audit:db` reports nothing wrong
- [ ] `node tools/upgradeCheck.mjs` is green across the install
- [ ] `versionCode` incremented, and `package.json` matches `versionName`
- [ ] Vercel redeployed if anything under `api/` changed — the app and the API
      ship separately, and a screen expecting a field the deployed API does not
      return will render without it
- [ ] `ALLOWED_ORIGINS` is set in Vercel. Worth doing — but it stops a *browser*
      on somebody else's website, and nothing else. A script, or anything that
      omits an `Origin` header, is unaffected: both were tested against
      production and both got a 200. What actually defends the Gemini budget is
      `api/_rateLimit.js`, so treat that as the control and this as tidiness
- [ ] `RATE_LIMIT_SALT` is set in Vercel to a private value
- [ ] The privacy policy still matches what the app does, and the Play Data
      Safety form still matches the privacy policy
