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

1. Bump the version in `android/app/build.gradle`:
   ```gradle
   versionCode 2        // must increase every upload
   versionName "1.0.1"
   ```

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

- [ ] `npm run build` passes
- [ ] `versionCode` was incremented
- [ ] `ALLOWED_ORIGINS` is set in Vercel so the API is not open to the world
- [ ] Tested identification, both languages, and the professional view on a device
