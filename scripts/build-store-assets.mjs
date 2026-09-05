import { mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const assets = path.join(root, 'store', 'assets');
await mkdir(assets, { recursive: true });

await sharp(path.join(assets, 'icon-1024.png'))
  .resize(512, 512, { fit: 'fill' })
  .png({ compressionLevel: 9 })
  .toFile(path.join(assets, 'google-play-icon-512.png'));

await sharp(path.join(assets, 'feature-graphic.svg'), { density: 144 })
  .resize(1024, 500, { fit: 'fill' })
  .flatten({ background: '#071a3e' })
  .png({ compressionLevel: 9 })
  .toFile(path.join(assets, 'google-play-feature-graphic.png'));

const screenshotDirectory = path.join(assets, 'screenshots');
for (const file of await readdir(screenshotDirectory)) {
  if (!file.endsWith('.png')) continue;
  const screenshot = path.join(screenshotDirectory, file);
  const temporary = `${screenshot}.normalized`;
  await sharp(screenshot).png({ compressionLevel: 9 }).toFile(temporary);
  await rename(temporary, screenshot);
}

console.log('Google Play icon, feature graphic and screenshots generated.');
