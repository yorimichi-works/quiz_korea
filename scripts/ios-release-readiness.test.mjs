import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const text = path => readFile(path, 'utf8');

test('Xcode project has a release-ready iPhone target', async () => {
  const project = await text('ios/Meonjeo.xcodeproj/project.pbxproj');
  for (const expected of [
    'com.yorimichiworks.meonjeo',
    'MARKETING_VERSION = 1.0.0',
    'CURRENT_PROJECT_VERSION = 1',
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
  for (const expected of ['OAuthProvider', 'linkWithCredential', 'reauthenticateWithCredential', 'completeNativeAppleSignIn', 'mergeGuestProgress', 'accounts:revokeToken', "tokenType: 'CODE'"]) {
    assert.match(auth, new RegExp(expected));
  }
  assert.match(app, /Apple로 계속하기/);
  assert.match(app, /signInWithApple/);
  assert.match(app, /nativeHaptic\('medium'\)/);
  assert.match(app, /결과 공유하기/);
  assert.equal(publicAuth, auth);
  assert.equal(publicApp, app);
});
