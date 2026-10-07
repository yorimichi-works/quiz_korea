import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(path, 'utf8');
const appID = 'ca-app-pub-3186852093801241~6780777097';
const unitID = 'ca-app-pub-3186852093801241/3315999799';
const testUnit = 'ca-app-pub-3940256099942544/4411468910';
const validate = overrides => spawnSync('bash', ['ios/Scripts/validate-admob-config.sh'], {
  env: { ...process.env, CONFIGURATION: 'Release', MONJO_ADMOB_APP_ID: appID,
    MONJO_INTERSTITIAL_AD_UNIT_ID: unitID, MONJO_ADS_TRACKING_ENABLED: 'YES', ...overrides },
  encoding: 'utf8',
});

test('release validation accepts configured public IDs and rejects missing, dummy and mismatched IDs', () => {
  assert.equal(validate({}).status, 0);
  for (const value of ['', '$(MISSING)', 'sample', 'ca-app-pub-0000000000000000~0000000000']) {
    assert.notEqual(validate({ MONJO_ADMOB_APP_ID: value }).status, 0);
  }
  for (const value of ['', '$(MISSING)', testUnit, 'ca-app-pub-1234567890123456/1234567890']) {
    assert.notEqual(validate({ MONJO_INTERSTITIAL_AD_UNIT_ID: value }).status, 0);
  }
});

test('debug uses registered app consent configuration and test ads; ATT gating cannot be silently disabled', () => {
  assert.equal(validate({ CONFIGURATION: 'Debug', MONJO_INTERSTITIAL_AD_UNIT_ID: testUnit }).status, 0);
  assert.notEqual(validate({ CONFIGURATION: 'Debug' }).status, 0);
  assert.notEqual(validate({ MONJO_ADS_TRACKING_ENABLED: 'NO' }).status, 0);
  const debug = read('ios/Configuration/Ads-Debug.xcconfig');
  assert.ok(debug.includes(appID)); assert.ok(debug.includes(testUnit));
  const release = read('ios/Configuration/Ads-Release.xcconfig');
  assert.ok(release.includes(appID)); assert.ok(release.includes(unitID));
});

test('bridge bootstrap preserves exact request and document correlation through a frozen v4 capability', () => {
  const swift = read('ios/Meonjeo/NativeBridge.swift');
  const source = swift.match(/static let bootstrapScript = #"""\n([\s\S]*?)\n    """#/)[1];
  const sent = [];
  const context = vm.createContext({ crypto: { randomUUID: () => 'document-id' },
    window: { webkit: { messageHandlers: { meonjeoNative: { postMessage: body => sent.push(body) } } } } });
  vm.runInContext(source, context);
  const bridge = context.window.meonjeoNative;
  assert.equal(bridge.bridgeVersion, 4); assert.equal(bridge.ads.version, 1);
  assert.ok(Object.isFrozen(bridge)); assert.ok(Object.isFrozen(bridge.ads));
  bridge.ads.request('request-id', 'present', { generation: 3, matchId: 'match-id', expiresAt: 1 });
  assert.equal(sent.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0])), { action: 'ads', requestId: 'request-id',
    operation: 'present', payload: { generation: 3, matchId: 'match-id', expiresAt: 1 }, documentId: 'document-id' });
});

test('Xcode links exact official SDK packages, ad policy, and precompile release validation', () => {
  const project = read('ios/Meonjeo.xcodeproj/project.pbxproj');
  assert.match(project, /version = 13\.11\.0/);
  assert.match(project, /version = 3\.1\.0/);
  assert.equal((project.match(/kind = exactVersion/g) || []).length, 2);
  assert.match(project, /AdPolicy\.swift in Sources/);
  assert.match(project, /AdCoordinator\.swift in Sources/);
  assert.match(project, /validate-admob-config\.sh/);
  assert.match(project, /CURRENT_PROJECT_VERSION = 3/);
});

test('SDK startup is fail-closed and configures privacy before initialization', () => {
  const source = read('ios/Meonjeo/AdCoordinator.swift');
  assert.match(source, /guard configurationVerified, trackingAuthorized else \{ policy\.consent = \.blocked; return \}/);
  assert.match(source, /guard configurationVerified, trackingAuthorized, launchUpdateFinished, policy\.canRequestAds/);
  const start = source.slice(source.indexOf('private func startSDKAndLoad()'), source.indexOf('private func loadAd()'));
  assert.ok(start.indexOf('setPublisherFirstPartyIDEnabled(false)') < start.indexOf('MobileAds.shared.start'));
  assert.ok(start.indexOf('publisherPrivacyPersonalizationState = .disabled') < start.indexOf('MobileAds.shared.start'));
  assert.match(source, /extras\.additionalParameters = \["npa": "1"\]/);
  assert.match(source, /trackingEnabled && ATTrackingManager\.trackingAuthorizationStatus == \.authorized/);
  assert.doesNotMatch(source, /tagForChildDirectedTreatment|tagForUnderAgeOfConsent|isTaggedForUnderAgeOfConsent\s*=/);
  const plist = read('ios/Meonjeo/Info.plist');
  assert.match(plist, /<key>MonjoAdsConsentConfigurationVerified<\/key>\s*<false\/>/);
  assert.doesNotMatch(plist, /NSAllowsArbitraryLoads/);
});
