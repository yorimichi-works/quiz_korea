import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const read = path => readFileSync(path, 'utf8');
const productionGate = 'MonjoAdsConsentConfigurationVerified';
const testGate = 'MonjoAdsTestConsentConfigurationVerified';
const appID = 'ca-app-pub-3186852093801241~6780777097';
const unitID = 'ca-app-pub-3186852093801241/3315999799';
const testUnit = 'ca-app-pub-3940256099942544/4411468910';
function setGate(source, key, value) {
  return source.replace(new RegExp(`<key>${key}</key>\\s*<(?:false|true)/>`),
    value === null ? '' : `<key>${key}</key>${value}`);
}
function runGate({ mode = 'production', production = '<false/>', testing = '<false/>',
  configChange = source => source, builtChange } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'monjo-ads-gate-'));
  try {
    const path = join(directory, 'Info.plist');
    const config = join(directory, 'Ads.xcconfig');
    const source = setGate(setGate(read('ios/Meonjeo/Info.plist'), productionGate, production), testGate, testing);
    writeFileSync(path, source);
    writeFileSync(config, configChange(read(`ios/Configuration/Ads-${mode === 'production' ? 'Release' : 'AdTesting'}.xcconfig`)));
    const args = ['scripts/verify-advertising-release.py', '--mode', mode, '--plist', path, '--xcconfig', config];
    if (builtChange) {
      let built = source.replace('$(MONJO_ADMOB_APP_ID)', appID)
        .replace('$(MONJO_INTERSTITIAL_AD_UNIT_ID)', mode === 'production' ? unitID : testUnit)
        .replace('$(MONJO_ADS_TRACKING_ENABLED)', 'YES').replace('$(MONJO_ADS_BUILD_MODE)', mode);
      built = builtChange(built);
      const builtPath = join(directory, 'Built.plist');
      writeFileSync(builtPath, built);
      args.push('--built-plist', builtPath);
    }
    return spawnSync('python3', args, { encoding: 'utf8' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const blocked = result => { assert.equal(result.status, 2, result.stdout); assert.match(result.stderr, /BLOCKED:/); };
const accepted = result => { assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /runtime UMP consent still required/); };

test('production upload rejects missing, false, string and numeric console verification', () => {
  for (const production of [null, '<false/>', '<string>true</string>', '<string>YES</string>', '<integer>1</integer>']) {
    blocked(runGate({ production }));
  }
  accepted(runGate({ production: '<true/>' }));
});

test('test upload has its own strict gate and never enables the production gate', () => {
  for (const testing of [null, '<false/>', '<string>true</string>', '<string>YES</string>', '<integer>1</integer>']) {
    blocked(runGate({ mode: 'ad-testing', testing }));
  }
  accepted(runGate({ mode: 'ad-testing', testing: '<true/>' }));
  blocked(runGate({ testing: '<true/>' }));
  blocked(runGate({ mode: 'ad-testing', testing: '<true/>', production: '<true/>' }));
  blocked(runGate({ mode: 'ad-testing', testing: '<true/>', production: null }));
});

test('production source rejects test mode, test units and other real units', () => {
  for (const configChange of [
    source => source.replace('= production', '= ad-testing'),
    source => source.replace(unitID, testUnit),
    source => source.replace(unitID, 'ca-app-pub-3186852093801241/1234567890'),
  ]) blocked(runGate({ production: '<true/>', configChange }));
});

test('test source rejects real ad units, wrong app IDs and mode drift', () => {
  for (const configChange of [
    source => source.replace(testUnit, unitID),
    source => source.replace(appID, 'ca-app-pub-3940256099942544~1458002511'),
    source => source.replace('= ad-testing', '= production'),
    source => source.replace('= YES', '= NO'),
  ]) blocked(runGate({ mode: 'ad-testing', testing: '<true/>', configChange }));
});

test('expanded signed bundle must independently match the selected mode, IDs and gate', () => {
  for (const mode of ['production', 'ad-testing']) {
    const options = { mode, [mode === 'production' ? 'production' : 'testing']: '<true/>' };
    accepted(runGate({ ...options, builtChange: source => source }));
    const expectedUnit = mode === 'production' ? unitID : testUnit;
    const oppositeUnit = mode === 'production' ? testUnit : unitID;
    for (const builtChange of [
      source => source.replace(expectedUnit, oppositeUnit),
      source => source.replace(expectedUnit, '$(MONJO_INTERSTITIAL_AD_UNIT_ID)'),
      source => source.replace(`<string>${mode}</string>`, '<string>debug</string>'),
      source => source.replace(/(<key>MonjoAds(?:Test)?ConsentConfigurationVerified<\/key>)<true\/>/, '$1<false/>'),
    ]) blocked(runGate({ ...options, builtChange }));
  }
});

test('checked-in production is blocked and test preflight follows its separate explicit Boolean record', () => {
  blocked(spawnSync('python3', ['scripts/verify-advertising-release.py'], { encoding: 'utf8' }));
  const source = read('ios/Meonjeo/Info.plist');
  const match = source.match(/<key>MonjoAdsTestConsentConfigurationVerified<\/key>\s*<(true|false)\/>/);
  assert.ok(match, 'The test gate must be a literal Boolean');
  const result = spawnSync('python3', ['scripts/verify-advertising-release.py', '--mode', 'ad-testing'], { encoding: 'utf8' });
  (match[1] === 'true' ? accepted : blocked)(result);
});
