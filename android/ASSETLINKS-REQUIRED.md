# ⚠️ One step you MUST do before the app goes live on Play

`public/.well-known/assetlinks.json` currently contains **only the upload-key
fingerprint** (the key in `android/android.keystore`). That is enough for a
locally-built APK, but **not** for the build Google ships to students.

## Why this matters

If Google Play Console has **Play App Signing** enabled (it does by default, and
you should keep it), Google **re-signs** your app with *their own* key before
delivering it. So the app on a student's phone is signed with a fingerprint that
is not in this file yet.

When the fingerprint doesn't match, Digital Asset Links verification fails, and
`twa-manifest.json`'s `"fallbackType": "customtabs"` kicks in. The app then opens
**with a visible careerrai.in address bar across the top** — which is the exact
signature Play reviewers look for when rejecting an app as a repackaged website
(Spam & Minimum Functionality policy).

**This is a rejection, not a warning.**

## What to do

1. In Play Console, open your app → **Test and release → Setup → App signing**.
2. Copy the **SHA-256 certificate fingerprint** under *App signing key
   certificate* (NOT the upload key — that one is already in the file).
3. Add it to the `sha256_cert_fingerprints` array in
   `public/.well-known/assetlinks.json`, keeping the existing entry:

   ```json
   "sha256_cert_fingerprints": [
     "30:7D:08:E8:F0:F8:CE:C3:C9:22:7D:B6:F4:E7:A9:3F:5C:90:43:AD:BD:33:53:98:22:9E:26:98:28:00:49:2B",
     "PASTE:THE:PLAY:APP:SIGNING:SHA256:HERE"
   ]
   ```

4. Deploy the site (this file is served statically from `public/`).
5. Verify it is live and correct:

   ```
   curl https://careerrai.in/.well-known/assetlinks.json
   ```

6. Confirm Android accepts it:

   https://developers.google.com/digital-asset-links/tools/generator

   Host: `careerrai.in` — this must match `"host"` in `twa-manifest.json`.
   It is **not** `careerrai-daily.vercel.app`.

7. Install the release build and confirm there is **no address bar**. If you see
   one, verification is still failing — do not submit.
