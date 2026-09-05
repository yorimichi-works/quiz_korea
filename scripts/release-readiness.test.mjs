import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pngInfo = path => {
  const data = readFileSync(new URL(`../${path}`, import.meta.url));
  assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG', `${path} must be a PNG`);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
    size: data.length,
  };
};

test('root and public browser clients remain identical', () => {
  for (const file of ['app.js', 'auth.js', 'styles.css', 'sw.js', 'manifest.webmanifest']) {
    assert.equal(read(file), read(`public/${file}`), `${file} must match its public copy`);
  }
});

test('PWA manifest has install and store icon metadata', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.start_url, '/game.html');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  for (const file of ['public/icon-192.png', 'public/icon-512.png', 'public/icon-maskable-512.png', 'public/apple-touch-icon.png', 'store/assets/icon-1024.png']) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), true, `${file} is required`);
  }
});

test('Google Play preview assets meet mandatory dimensions', () => {
  const icon = pngInfo('store/assets/google-play-icon-512.png');
  assert.deepEqual([icon.width, icon.height], [512, 512]);
  assert.equal(icon.colorType, 6, 'Play icon must be a 32-bit PNG with alpha');
  assert.ok(icon.size <= 1024 * 1024, 'Play icon must be at most 1 MB');

  const feature = pngInfo('store/assets/google-play-feature-graphic.png');
  assert.deepEqual([feature.width, feature.height], [1024, 500]);
  assert.equal(feature.colorType, 2, 'Feature graphic must not have an alpha channel');

  const screenshotDirectory = new URL('../store/assets/screenshots/', import.meta.url);
  const screenshots = readdirSync(screenshotDirectory).filter(file => file.endsWith('.png'));
  assert.ok(screenshots.length >= 2, 'At least two screenshots are required');
  for (const screenshot of screenshots) {
    const image = pngInfo(`store/assets/screenshots/${screenshot}`);
    const shortSide = Math.min(image.width, image.height);
    const longSide = Math.max(image.width, image.height);
    assert.ok(shortSide >= 320 && longSide <= 3840, `${screenshot} is outside Play dimensions`);
    assert.ok(longSide <= shortSide * 2, `${screenshot} exceeds the 2:1 aspect-ratio limit`);
  }
});

test('policy, support and deletion pages are present and linked in-app', () => {
  for (const route of ['privacy', 'terms', 'support', 'account-deletion']) {
    assert.equal(existsSync(new URL(`../app/${route}/page.tsx`, import.meta.url)), true);
  }
  const client = read('app.js');
  assert.match(client, /id="privacy-link"/);
  assert.match(client, /id="terms-link"/);
  assert.match(client, /id="account-delete"/);
  assert.match(client, /openAccountDeletionDialog/);
  const privacy = read('app/privacy/page.tsx');
  assert.match(privacy, /IP 주소/);
  assert.match(privacy, /Trusted Web Activity/);
});

test('reports are transmitted to a durable API with offline retry', () => {
  const client = read('app.js');
  const auth = read('auth.js');
  const api = read('app/api/reports/route.ts');
  assert.match(auth, /submitReport: report => playerApi\('\/api\/reports'/);
  assert.match(client, /flushReportOutbox/);
  assert.match(api, /INSERT OR IGNORE INTO meonjeo_reports/);
  assert.match(api, /REPORT_LIMIT_PER_HOUR/);
});

test('account deletion removes authentication and associated server data', () => {
  const auth = read('auth.js');
  const api = read('app/api/account/route.ts');
  assert.match(auth, /await deleteUser\(auth\.currentUser\)/);
  for (const table of ['meonjeo_match_events', 'meonjeo_matches', 'meonjeo_match_queue', 'meonjeo_realtime_sessions', 'meonjeo_quiz_time_events', 'meonjeo_reports', 'meonjeo_player_titles', 'meonjeo_player_progress']) {
    assert.match(api, new RegExp(`DELETE FROM ${table}`));
  }
});

test('production shell contains no fake online count and hides QA controls by default', () => {
  const html = read('public/game.html');
  const client = read('app.js');
  assert.doesNotMatch(html, /1,248명 온라인/);
  assert.match(html, /실시간 대전/);
  assert.match(client, /const qaControls = \['localhost','127\.0\.0\.1'\]/);
});
