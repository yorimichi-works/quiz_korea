import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = path.resolve('store/assets/icon-1024.png');
const destinationDirectory = path.resolve('ios/Meonjeo/Assets.xcassets/AppIcon.appiconset');
const destination = path.join(destinationDirectory, 'AppIcon-1024.png');

await mkdir(destinationDirectory, { recursive: true });
await sharp(source)
  .resize(1024, 1024, { fit: 'cover' })
  .flatten({ background: '#f7faff' })
  .png()
  .toFile(destination);

console.log(`Created ${path.relative(process.cwd(), destination)} (1024x1024, no alpha)`);
