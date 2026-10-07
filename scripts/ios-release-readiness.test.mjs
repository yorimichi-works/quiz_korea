import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const text = path => readFile(path, 'utf8');

test('Xcode project has the expected iPhone target configuration (not signing evidence)', async () => {
  const project = await text('ios/Meonjeo.xcodeproj/project.pbxproj');
  for (const expected of [
    'com.yorimichiworks.meonjeo',
    'MARKETING_VERSION = 1.0.0',
    'CURRENT_PROJECT_VERSION = 2',
    'IPHONEOS_DEPLOYMENT_TARGET = 16.0',
    'TARGETED_DEVICE_FAMILY = 1',
    'CODE_SIGN_ENTITLEMENTS = Meonjeo/Meonjeo.entitlements',
    'NativeBridge.swift in Sources',
    'Assets.xcassets in Resources',
  ]) assert.match(project, new RegExp(expected.replaceAll('.', '\\.').replace(/[()]/g, '\\$&')));
});

test('iOS metadata enables Apple login without broad transport exceptions', async () => {
  const [plist, entitlements] = await Promise.all([
    text('ios/Meonjeo/Info.plist'),
    text('ios/Meonjeo/Meonjeo.entitlements'),
  ]);
  assert.match(plist, /<string>먼저!<\/string>/);
  assert.match(plist, /ITSAppUsesNonExemptEncryption/);
  assert.doesNotMatch(plist, /NSAllowsArbitraryLoads/);
  assert.match(entitlements, /com\.apple\.developer\.applesignin/);
  assert.match(entitlements, /<string>Default<\/string>/);
});

test('native shell includes security and useful native behavior', async () => {
  const [webView, bridge, content] = await Promise.all([
    text('ios/Meonjeo/GameWebView.swift'),
    text('ios/Meonjeo/NativeBridge.swift'),
    text('ios/Meonjeo/ContentView.swift'),
  ]);
  assert.match(webView, /https:\/\/meonjeo\.syamo\.chatgpt\.site\/game\.html/);
  assert.match(webView, /reloadFromOrigin/);
  assert.match(webView, /UIApplication\.shared\.open/);
  assert.match(bridge, /AuthenticationServices/);
  assert.match(bridge, /securityOrigin\.host\.lowercased\(\) == Self\.allowedHost/);
  assert.match(bridge, /SecRandomCopyBytes/);
  assert.match(bridge, /SHA256\.hash/);
  assert.match(bridge, /completeNativeAppleSignIn/);
  assert.match(bridge, /authorizationCode/);
  assert.match(bridge, /UIActivityViewController/);
  assert.match(bridge, /UIImpactFeedbackGenerator/);
  assert.match(content, /NWPathMonitor/);
});

test('App Store icon is 1024px RGB with no alpha channel', async () => {
  const png = await readFile('ios/Meonjeo/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png');
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[25], 2, 'PNG color type must be RGB without alpha');
});

test('web auth supports native Apple guest linking and deletion reauthentication', async () => {
  const [auth, app, publicAuth, publicApp] = await Promise.all([
    text('auth.js'),
    text('app.js'),
    text('public/auth.js'),
    text('public/app.js'),
  ]);
  for (const expected of ['OAuthProvider', 'linkWithCredential', 'reauthenticateWithCredential', 'completeNativeAppleSignIn', 'mergeGuestProgress', 'supportsNativeAppleRevocation', 'revokeAppleToken', 'completeNativeAppleRevocation']) {
    assert.match(auth, new RegExp(expected));
  }
  assert.match(app, /Apple로 계속하기/);
  assert.match(app, /signInWithApple/);
  assert.match(app, /nativeHaptic\('medium'\)/);
  assert.match(app, /결과 공유하기/);
  assert.equal(publicAuth, auth);
  assert.equal(publicApp, app);
});


test('Apple privacy and deletion guidance match the native account flow', async () => {
  const [privacy, deletion] = await Promise.all([
    text('app/privacy/page.tsx'), text('app/account-deletion/page.tsx'),
  ]);
  for (const phrase of ['Google·Apple', 'Firebase Authentication', 'WKWebView', '이메일 가리기', 'Apple 인증 토큰', '이용 현황 분석']) {
    assert.ok(privacy.includes(phrase), `Privacy must explain ${phrase}`);
  }
  assert.match(deletion, /Google·Apple/);
  assert.match(deletion, /iOS 앱에서/);
  assert.match(deletion, /Apple 인증 토큰/);
});

test('the shared scheme supports Archive and current SDK instructions are explicit', async () => {
  const [scheme, readme, readiness] = await Promise.all([
    text('ios/Meonjeo.xcodeproj/xcshareddata/xcschemes/Meonjeo.xcscheme'),
    text('ios/README.md'), text('store/apple/APP_STORE_READINESS.md'),
  ]);
  assert.match(scheme, /ArchiveAction buildConfiguration\s*=\s*"Release"/);
  assert.match(scheme, /BlueprintIdentifier\s*=\s*"A50000000000000000000001"/);
  for (const document of [readme, readiness]) {
    assert.match(document, /Xcode 26/);
    assert.match(document, /iOS 26 SDK/);
    assert.doesNotMatch(document, /Xcode 16以降/);
  }
});

test('Korean App Store metadata stays within conservative field limits', async () => {
  const listing = await text('store/apple/listing-ko.md');
  for (const [heading, max] of [['이름', 30], ['부제', 30], ['프로모션 문구', 170], ['설명', 4000], ['キーワード案', 100]]) {
    const marker = `## ${heading}\n`;
    const body = listing.split(marker)[1]?.split('\n## ')[0]?.trim();
    assert.ok(body, `${heading} must be present`);
    assert.ok([...body].length <= max, `${heading} exceeds ${max} characters`);
    if (heading === 'キーワード案') assert.ok(Buffer.byteLength(body, 'utf8') <= 100, 'Keywords also fit the conservative 100-byte limit');
  }
});
