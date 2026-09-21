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

---

# The Play Console, step by step

Console navigation changes names every so often. Where a label has moved, the
section it lives under is given too, so it can still be found.

## 0. Before you open the Console

Produce the signed bundle. Play has required an `.aab` rather than an `.apk`
for updates since 2021, and will refuse the APK.

```bash
npm run sync:android
```

```bash
cd android && ./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

This needs `android/keystore.properties` to exist, or Gradle silently produces
an *unsigned* bundle that the Console rejects on upload. Copy
`android/keystore.properties.example`, fill in the four values, and never
commit it — it is git-ignored for a reason.

> Which key: if the app is on **Play App Signing** (Release → Setup → App
> signing shows an "App signing key certificate" that Google holds), the file
> must point at your **upload** key. Google re-signs with the real key on its
> side. If it is not on Play App Signing, the file must point at the original
> release key, and there is no recovery if it is lost.

## 1. Create the release

**Test and release → Production → Create new release.**

1. Upload `app-release.aab`. The Console shows the version code it read — check
   it says **9**. If it complains the version code is already used, bump
   `versionCode` in `android/app/build.gradle`, rebuild, and upload again.
2. **Release name** is internal only. `1.5.0 (9)` is enough.
3. **Release notes** — paste the "What's new" text from
   [STORE-LISTING.md](STORE-LISTING.md), per language. Anything over 500
   characters is refused.
4. Do not click *Review release* yet. Everything below can be edited while the
   release sits as a draft, and it is better to have the listing right before
   the review starts.

## 2. Rewrite the store listing

**Grow users → Store presence → Main store listing.**

Paste each field from [STORE-LISTING.md](STORE-LISTING.md). Two rules:

- **Plain text only.** The current description is written in Unicode bold
  letters. Screen readers read those as gibberish and Play's search may not
  index them as words — it costs accessibility and discoverability to get bold.
- **English (United States) is the default listing.** Add Arabic as a separate
  localisation rather than mixing languages in one field: *Main store listing →
  Manage translations → Add your own translation text → العربية*.

### Graphics

| Asset | Exact requirement | Where |
| --- | --- | --- |
| App icon | 512 x 512, 32-bit PNG, under 1 MB | `Playstore icons/play-store-icon-512.png` — already correct |
| Feature graphic | **exactly** 1024 x 500, PNG or JPEG, no transparency | generated — see below |
| Phone screenshots | 2–8, PNG or JPEG, each side 320–3840 px, and the long side at most **twice** the short side | generated — see below |
| Tablet screenshots | optional | skip unless you want tablet placement |

The old `graphical.png` is 2976 x 1440 and will be refused: the feature graphic
is a fixed size, not an aspect ratio.

The old `screenshot-1..4.png` are 471 x 971 — a 2.06 ratio, over the limit —
and they show a design this update replaces. Do not reuse them.

**A raw phone screenshot from a modern handset is refused.** 1080 x 2400 is a
2.22 ratio. Either compose it into a 1080 x 1920 frame, or crop it.

## 3. The promo video

**Play does not accept a video file.** The field on the store listing takes a
**YouTube URL and nothing else**, so an `.mp4` has to be uploaded to YouTube
first.

For the link to be accepted and to behave:

- Upload to YouTube as **Public** or **Unlisted**. Private will not play.
- **Turn monetisation off for that video.** Play rejects promo videos that can
  show ads.
- Do not mark it "made for kids" or let it be age-restricted.
- Paste the full watch URL — `https://www.youtube.com/watch?v=XXXXXXXXXXX`.
  Not a Shorts URL, not a playlist, not a share-shortened `youtu.be` link.
- Google recommends **landscape**. A portrait video still plays, but it is shown
  in a landscape frame with bars down both sides.
- Play draws a play button over the middle of the feature graphic once a video
  is set, so keep the centre of that image clear.

## 4. App content — the part that is currently wrong

**Policy and programmes → App content.**

### Content rating

The app is rated **3+** while giving dosage instructions. That is a category
mismatch and listing under a young rating invites policy scrutiny you do not
need.

*Content rating → Start new questionnaire.* Category: **Reference, News or
Educational** or **Utility, Productivity, Communication or Other** — not Game.
Answer the medical-content questions honestly: the app provides drug
information including dosing. Expect the result to come back **Teen / PEGI 12
/ Everyone 10+** depending on the region. Submitting a new questionnaire
replaces the old rating.

### Target audience and content

*Target audience and content → set the age groups to 18+ (or 13+).* Removing
the under-13 groups takes the app out of the Families programme and its extra
requirements.

### Data safety

*Data safety → Manage.* It currently declares "Personal info" and "App info and
performance" as collected. Check that against what the app actually does:

- Saved medicines, people and reminder times never leave the device. **Device-
  only storage is not collection** and should not be declared.
- The medicine name typed or photographed is sent to the API. That is app
  activity, not personal info, unless you are storing it against a user.
- Photographs are sent for identification and **not** retained.
- Caller addresses are hashed for rate limiting.

Whatever you declare has to match `public/privacy-policy.html`. Play checks.

### Health apps declaration

An app giving medication information may be asked to complete the **Health
apps** declaration. Answer it. Do not claim any diagnosis, treatment or
measurement capability — this app reports published information and says so.

### Category

*Grow users → Store presence → Store settings → App category.* Change from
**Tools** to **Medical**. This changes which searches the app appears in, and
it is the honest category.

Moving into Medical can attract a closer policy read. The disclaimer on first
run and under every answer is what that review is looking for.

## 5. Roll out

Back to **Test and release → Production**, open the draft release, *Review
release*, then *Start rollout to Production*.

- A **staged rollout** (start at 20%) lets you halt if crash reports spike.
  There is no reason to go straight to 100% on the largest update so far.
- Review usually takes hours but is allowed to take days, and the first update
  after a category change is a likely candidate for the slow path.
- Watch **Monitor and improve → Android vitals** for the first few days. A
  crash rate above 1.09% or an ANR rate above 0.47% puts the listing at risk of
  demotion.
