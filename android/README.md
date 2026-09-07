# 먼저! Android / Google Play

This directory is a Trusted Web Activity wrapper for the production PWA.

- Release package ID: `com.yorimichiworks.meonjeo`
- Version: `1.0.0` / version code `1`
- Target SDK: Android API 36
- Minimum SDK: Android API 23
- Launch URL: `https://meonjeo.syamo.chatgpt.site/game.html`
- Notifications and advertising permissions: disabled

This package ID is the selected release identifier. Confirm it once more before
the first Play Console upload because it cannot be changed for that app record.

## Build an unsigned verification bundle

From the repository root:

```powershell
npm run android:bundle
npm run android:verify
```

The result is copied to `store/android/meonjeo-1.0.0-unsigned.aab`.

## Create the upload key

Create the upload key with a cryptographically random password. The password is
not printed or passed as a command-line value:

```powershell
npm run android:key:create
```

The script refuses to overwrite existing signing material. It creates the
ignored files `android/upload-key.jks`, `android/keystore.properties`, and
`android/upload-certificate.pem`. Immediately back up the JKS and properties
files together to an encrypted location outside this repository before the
first Play upload. Both are needed to reproduce this upload credential.

Then build:

```powershell
npm run android:bundle -- -RequireSigned
```

The signed result is copied to `store/android/meonjeo-1.0.0-signed.aab`.
The build fails unless the AAB contains a valid JAR signature when signing is
requested.
The current release file hash, size, and public upload-certificate fingerprint
are recorded in `store/android/release-artifact.json`.

## Digital Asset Links

After Play App Signing is enabled, copy the **Play app signing certificate**
SHA-256 fingerprint (not only the upload-key fingerprint) into the hosted
`MEONJEO_ANDROID_SHA256_CERT_FINGERPRINT` environment value. Multiple
fingerprints can be comma-separated. The website then serves the association at:

`https://meonjeo.syamo.chatgpt.site/.well-known/assetlinks.json`

Until a valid fingerprint is configured, the endpoint intentionally returns an
empty array and Android opens a Custom Tab instead of pretending verification
succeeded.

## Updating the wrapper

The reviewed Gradle project in this directory is the source of truth. Update
`twa-manifest.json`, `app/build.gradle`, and the version together, then run
`npm run android:bundle` and `npm run android:verify`.

If the wrapper must be recreated in the future, use the then-current official
Bubblewrap release in a temporary directory and review its generated diff
before replacing this project. Bubblewrap is intentionally not a persistent
repository dependency because its generator-only transitive packages are not
part of the Android application.
