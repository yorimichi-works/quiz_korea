import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const fixture = String.raw`
import hashlib, json, plistlib, sys, zipfile
from pathlib import Path
root = Path(sys.argv[1]); case = sys.argv[2]
info = {
 'CFBundleIdentifier':'com.yorimichiworks.meonjeo', 'CFBundleShortVersionString':'1.0.0', 'CFBundleVersion':'4',
 'GADApplicationIdentifier':'ca-app-pub-3186852093801241~6780777097',
 'MonjoInterstitialAdUnitID':'ca-app-pub-3186852093801241/3315999799',
 'MonjoAdsTrackingEnabled':'YES', 'MonjoAdsBuildMode':'production',
 'GADDelayAppMeasurementInit':True, 'MonjoAdsConsentConfigurationVerified':True,
 'NSUserTrackingUsageDescription':'Test fixture ATT purpose',
}
selection = {'app_id':'6819903098', 'bundle_id':info['CFBundleIdentifier'], 'version':'1.0.0', 'build':'4',
 'internal_testing_only':False, 'advertising':True, 'device_id_tracking':True}
receipt = {'bundle_id':info['CFBundleIdentifier'], 'version':'1.0.0', 'build':'4',
 'source_commit':'a'*40, 'advertising_mode':'production', 'test_ads_only':False,
 'advertising_configuration_verified':True}
if case == 'legacy-build2':
 info = {key:info[key] for key in ['CFBundleIdentifier','CFBundleShortVersionString','CFBundleVersion']}
 info['CFBundleVersion']='2'; selection['build']='2'; receipt['build']='2'
elif case == 'internal-build3':
 info.update(CFBundleVersion='3', MonjoAdsBuildMode='ad-testing', MonjoAdsConsentConfigurationVerified=False,
  MonjoAdsTestConsentConfigurationVerified=True, MonjoInterstitialAdUnitID='ca-app-pub-3940256099942544/4411468910')
 selection.update(build='3', internal_testing_only=True); receipt.update(build='3', advertising_mode='ad-testing', test_ads_only=True)
elif case == 'wrong-selected-build': selection['build']='2'
elif case == 'wrong-selected-app': selection['app_id']='999'
elif case == 'wrong-source': receipt['source_commit']='b'*40
elif case == 'missing-source': receipt.pop('source_commit')
elif case == 'missing-att': info.pop('NSUserTrackingUsageDescription')
elif case == 'disabled-production': info['MonjoAdsConsentConfigurationVerified']=False
elif case == 'no-tracking-label': selection['device_id_tracking']=False
elif case == 'string-bool': selection['internal_testing_only']='false'
elif case == 'internal-flag': selection['internal_testing_only']=True
elif case == 'test-receipt': receipt['test_ads_only']=True
elif case == 'wrong-receipt-build': receipt['build']='2'
elif case == 'no-advertising': selection['advertising']=False
ipa = root/'candidate.ipa'
with zipfile.ZipFile(ipa,'w') as z:
 z.writestr('Payload/Meonjeo.app/Info.plist',plistlib.dumps(info, fmt=plistlib.FMT_BINARY))
 if case == 'ambiguous-app': z.writestr('Payload/Other.app/Info.plist',plistlib.dumps(info))
receipt['ipa_sha256']=hashlib.sha256(ipa.read_bytes()).hexdigest()
if case == 'changed-ipa':
 with zipfile.ZipFile(ipa,'a') as z: z.writestr('Payload/Meonjeo.app/changed.txt','different artifact')
(root/'receipt.json').write_text(json.dumps(receipt)); (root/'selection.json').write_text(json.dumps(selection))
`;

function runSelection(caseName, extra = []) {
  const directory = mkdtempSync(join(tmpdir(), 'monjo-review-selection-'));
  try {
    const fixturePath = join(directory, 'fixture.py');
    writeFileSync(fixturePath, fixture);
    const prepared = spawnSync(python, [fixturePath, directory, caseName], { encoding:'utf8' });
    assert.equal(prepared.status, 0, prepared.stderr || prepared.error?.message);
    return spawnSync(python, ['scripts/verify-app-review-selection.py',
      '--ipa', join(directory, 'candidate.ipa'), '--signed-validation', join(directory, 'receipt.json'),
      '--selection', join(directory, 'selection.json'), '--expected-source-commit', 'a'.repeat(40), ...extra], { encoding:'utf8' });
  } finally {
    rmSync(directory, { recursive:true, force:true });
  }
}

test('matching production IPA and fresh selection readback establish identity, not runtime acceptance', () => {
  const result = runSelection('matching');
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.result, 'binary-selection-consistent');
  assert.equal(proof.build, '4');
  assert.match(proof.device_and_network_acceptance, /Not verified/);
});

for (const name of ['legacy-build2','internal-build3','wrong-selected-build','wrong-selected-app',
  'wrong-source','missing-source','missing-att','disabled-production','no-tracking-label','string-bool',
  'internal-flag','test-receipt','wrong-receipt-build','no-advertising','ambiguous-app','changed-ipa']) {
  test(`submission selection blocks ${name}`, () => {
    const result = runSelection(name);
    assert.equal(result.status, 2, result.stdout || result.stderr || result.error?.message);
    assert.match(result.stderr, /BLOCKED:/);
    assert.equal(result.stdout, '');
  });
}
