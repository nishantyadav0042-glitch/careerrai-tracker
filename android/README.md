# CareerRai — Android app (Play Store) via TWA

This turns the existing web app into a real, installable **Google Play Store**
app using a **Trusted Web Activity (TWA)**. It is still the same website under the
hood (`careerrai.in`) — no separate codebase, content updates ship
with your normal web deploy. The Play Store build simply targets a **current
Android SDK**, which is what removes the *"built for an older version of Android —
Unsafe app blocked"* Play Protect warning that browser-minted WebAPKs were hitting.

> **Why this fixes the blunder:** installing a PWA lets the *browser* generate the
> Android package (WebAPK), and you can't control its target SDK. OEM/older
> browsers produce a package Play Protect blocks. A Play-Store TWA is a package
> **you** build+sign with a modern target SDK, distributed through the Store — no
> Play Protect block, no "unknown sources", identical install on every Android.

Two build paths — pick one. **Path A (PWABuilder) needs no tools and is the
recommended route** if a non-developer owns the Play account.

---

## Fixed facts (must stay consistent, forever)
- **Package name:** `com.careerrai.app` (used in `twa-manifest.json` and
  `/public/.well-known/assetlinks.json`). **Can never change after the first
  Play Store upload.**
- **Domain:** `careerrai.in`. `assetlinks.json` MUST be served from
  this exact domain (it already is, from `public/.well-known/`). If you move to a
  custom domain later, the TWA `host` and assetlinks move with it.

---

## Path A — PWABuilder (no tools, ~20 min)
1. Go to **https://www.pwabuilder.com** → enter `https://careerrai.in` → **Start**.
2. Open the **Android** package options → **Store package**. Set:
   - Package ID: `com.careerrai.app`
   - App name: `CareerRai`
   - Launcher name: `CareerRai`
   - **Signing key:** "Create new" (PWABuilder generates one) — **download and
     back up the `.keystore` + passwords**. Losing it means you can never update
     the app.
   - Leave "Notification delegation" **ON** (this app depends on push).
3. Download the zip. It contains the **`.aab`** (upload this to Play) and a
   `signing-key-info` / `assetlinks.json` with the **SHA-256 fingerprint**.
4. Go to **§ Play Console** below.

## Path B — Bubblewrap CLI (for a developer)
Prereqs: Node 18+, JDK 17, Android SDK (Bubblewrap can install the JDK/SDK for you).
```bash
npm i -g @bubblewrap/cli
cd android
# Uses the committed twa-manifest.json in this folder:
bubblewrap build            # first run: `bubblewrap init --manifest https://careerrai.in/manifest.json` then copy over our twa-manifest.json values
```
- On first build Bubblewrap creates `android.keystore` — **back it up + save the
  passwords**. Output: `app-release-bundle.aab` (upload) + `app-release-signed.apk`
  (local testing).
- Print the fingerprint for assetlinks: `bubblewrap fingerprint list`.

---

## § Play Console (both paths)
1. **https://play.google.com/console** → pay the one-time **$25** and complete
   identity verification (can take 1–2 days — start early).
2. **Create app** → name `CareerRai`, app (not game), free.
3. **Upload the `.aab`** under a testing track first (Internal testing is instant
   and lets you install via a link without Play Protect issues), then promote to
   Production.
4. Keep **Play App Signing ON** (default). After the first upload, get the
   **App signing key SHA-256** from: Console → your app → **Test and release →
   Setup → App integrity → App signing** → copy the **SHA-256 certificate
   fingerprint**.
5. Fill the store listing (icon, screenshots, short/full description, privacy
   policy URL, data-safety form) and submit for review (~1–3 days).

---

## § Wire up Digital Asset Links (removes the URL bar; verifies app↔site)
1. Put the **SHA-256 fingerprint** from step 4 (and, if you also test a locally
   built APK, that key's fingerprint too — the array accepts multiple) into:
   `public/.well-known/assetlinks.json` — replace
   `REPLACE_WITH_APP_SIGNING_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE`.
2. Deploy the web app (normal `git push` to `main`).
3. Verify it's live and valid:
   - Open `https://careerrai.in/.well-known/assetlinks.json` — must
     return the JSON (not 404). If it 404s on Vercel, tell the dev to add a
     rewrite for `/.well-known/assetlinks.json`; usually the `public/` file works.
   - Test with Google's validator:
     `https://developers.google.com/digital-asset-links/tools/generator`

---

## § After the app is LIVE on Play (final web change)
So Chrome stops offering the flaky WebAPK and points users to the Play app:
1. In `public/manifest.json` add and flip:
   ```json
   "prefer_related_applications": true,
   "related_applications": [
     { "platform": "play", "id": "com.careerrai.app",
       "url": "https://play.google.com/store/apps/details?id=com.careerrai.app" }
   ]
   ```
2. Update the in-app install button (`src/components/install/install-button.tsx`) to
   link Android users straight to the Play Store listing instead of the WebAPK
   prompt. (Ask the dev — it's a small change once the listing URL exists.)

---

## Notes
- **iOS** is a separate track: PWABuilder can also produce an **App Store** package
  (iOS wraps the PWA too). Do it after Android is stable.
- **Notifications:** the TWA has notification delegation enabled, so web-push keeps
  working inside the installed app. Test push after install.
- **Updates:** you only rebuild/re-upload the AAB when you change the native shell
  (icon, name, target SDK). Day-to-day content changes need **no** app update —
  they come from the website.
