import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Signed Android artifacts are verified separately by android:verify.
const files = readdirSync('scripts').filter(file => /\.test\.(mjs|ts)$/.test(file) && file !== 'android-release-readiness.test.mjs').sort();
const result = spawnSync(process.execPath, ['--test', ...files.map(file => `scripts/${file}`)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
