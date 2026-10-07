import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
// Retain the game's blue round buzzer, white rim, yellow ring and gray base.
// Regeneration must use the vector master, not the previous lightning-only icon.
const source = path.join(root, 'assets/brand/game-buzzer-icon.svg');
const destinationDirectory = path.join(root, 'ios/Meonjeo/Assets.xcassets/AppIcon.appiconset');
const destination = path.join(destinationDirectory, 'AppIcon-1024.png');

await mkdir(destinationDirectory, { recursive: true });
await sharp(source, { density: 144 })
  .resize(1024, 1024)
  .flatten({ background: '#f5f8fc' })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(destination);

console.log(`Created ${path.relative(root, destination)} (1024x1024 RGB, no alpha, game buzzer motif)`);
