import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

test('Android package, host, version and API levels are release-consistent', async () => {
  const [twa, gradle, manifest] = await Promise.all([
    read('android/twa-manifest.json').then(JSON.parse),
    read('android/app/build.gradle'),
    read('android/app/src/main/AndroidManifest.xml'),
  ]);
  assert.equal(twa.packageId, 'com.yorimichiworks.meonjeo');
  assert.equal(twa.host, 'meonjeo.syamo.chatgpt.site');
  assert.equal(twa.startUrl, '/game.html');
  assert.equal(twa.appVersionCode, 1);
  assert.equal(twa.appVersionName, '1.0.0');
  assert.equal(twa.enableNotifications, false);
  assert.match(gradle, /compileSdkVersion 36/);
  assert.match(gradle, /targetSdkVersion 36/);
  assert.match(gradle, /minSdkVersion 23/);
  assert.match(gradle, /androidbrowserhelper:2\.7\.2/);
  assert.doesNotMatch(manifest, /\s+package=/);
  assert.match(manifest, /android:allowBackup="false"/);
});

test('release signing is opt-in and secrets are ignored', async () => {
  const [gitignore, gradle, example] = await Promise.all([
    read('.gitignore'),
    read('android/app/build.gradle'),
    read('android/keystore.properties.example'),
  ]);
  assert.match(gitignore, /android\/keystore\.properties/);
  assert.match(gitignore, /android\/\*\.jks/);
  assert.match(gradle, /hasReleaseSigning/);
  assert.match(example, /CHANGE_ME/);
});

test('Digital Asset Links waits for a valid Play signing fingerprint', async () => {
  const [route, template] = await Promise.all([
    read('app/.well-known/assetlinks.json/route.ts'),
    read('store/google-play/assetlinks.template.json'),
  ]);
  assert.match(route, /MEONJEO_ANDROID_SHA256_CERT_FINGERPRINT/);
  assert.match(route, /delegate_permission\/common\.handle_all_urls/);
  assert.match(template, /REPLACE_WITH_PLAY_APP_SIGNING_SHA256/);
});

test('Gradle produced a non-empty Android App Bundle', async () => {
  const bundle = path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab');
  const metadata = await stat(bundle);
  const header = await readFile(bundle).then((value) => value.subarray(0, 2).toString('ascii'));
  assert.ok(metadata.size > 500_000);
  assert.equal(header, 'PK');
});
