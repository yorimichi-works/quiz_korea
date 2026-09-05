# 먼저! Android / Google Play

This directory is a Trusted Web Activity wrapper for the production PWA.

- Package ID candidate: `com.yorimichiworks.meonjeo`
- Version: `1.0.0` / version code `1`
- Target SDK: Android API 36
- Minimum SDK: Android API 23
- Launch URL: `https://meonjeo.syamo.chatgpt.site/game.html`
- Notifications and advertising permissions: disabled

The package ID is only a candidate until the Play Console app record is created.
Confirm it before the first upload because it cannot be changed afterward.

## Build an unsigned verification bundle

From the repository root:

```powershell
npm run android:bundle
npm run android:verify
```

The result is copied to `store/android/meonjeo-1.0.0-unsigned.aab`.

## Create the upload key

Use the JDK 17 `keytool` interactively so passwords never appear in shell history:

```powershell
keytool -genkeypair -v -keystore android/upload-key.jks -alias meonjeo-upload -keyalg RSA -keysize 4096 -validity 10000
```

Copy `keystore.properties.example` to `keystore.properties` and enter the
passwords locally. Both files are ignored by Git. Back up the key and passwords
outside this repository before the first Play upload.

Then build:

```powershell
npm run android:bundle -- -RequireSigned
```

The signed result is copied to `store/android/meonjeo-1.0.0-signed.aab`.
The build fails unless the AAB contains a valid JAR signature when signing is
requested.

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
