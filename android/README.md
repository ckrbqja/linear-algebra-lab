# Flow Math Android package

This project packages `https://flow-math.com/` as a Trusted Web Activity.

- Application ID: `com.madebyneed.mathflow`
- App name: `Flow Math`
- Version name/code: `1` / `1`
- Minimum SDK: 21
- Compile/target SDK: 36 / 36
- Upload key alias: `mathflow-upload`

## Release artifacts

Run this from the repository root:

```powershell
.\android\package-release.ps1
```

The script produces these ignored local artifacts:

- `android/app-release-bundle.aab` for Google Play Console
- `android/app-release-signed.apk` for direct device testing

The upload keystore and its local credentials file are ignored by Git. Back up
both files in a secure password manager or encrypted storage before publishing:

- `android/android.keystore`
- `android/signing-credentials.properties`

## Trusted Web Activity verification

`public/.well-known/assetlinks.json` currently contains the upload-key
fingerprint so the locally signed APK can verify `flow-math.com`. Deploy that
file with the web frontend before testing the APK.

When Play App Signing is enabled, copy the **App signing key certificate**
SHA-256 fingerprint from Play Console and add it as another fingerprint in both
`android/twa-manifest.json` and `public/.well-known/assetlinks.json`. Keep the
upload fingerprint too so local release builds continue to verify.

Every Play release must increment `appVersionCode` in
`android/twa-manifest.json` and `android/app/build.gradle`. The first upload uses
version code `1`.
