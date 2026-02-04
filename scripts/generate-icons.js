const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

// SVG with Bitcoin symbol - using a proper B symbol that renders consistently
const createSvg = (size) => {
  const fontSize = Math.round(size * 0.55);
  const yPos = Math.round(size * 0.65);

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="#f59e0b"/>
      <text x="${size/2}" y="${yPos}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white">₿</text>
    </svg>
  `);
};

async function generateIcons() {
  const publicDir = path.join(__dirname, '..', 'public');

  for (const { name, size } of sizes) {
    const svg = createSvg(size);
    const outputPath = path.join(publicDir, name);

    try {
      await sharp(svg)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      console.log(`Generated: ${name} (${size}x${size})`);
    } catch (error) {
      console.error(`Failed to generate ${name}:`, error.message);
    }
  }

  // Also create a favicon.ico from 32x32
  try {
    const faviconSvg = createSvg(32);
    const faviconPath = path.join(publicDir, 'favicon.ico');
    await sharp(faviconSvg)
      .resize(32, 32)
      .png()
      .toFile(faviconPath);
    console.log('Generated: favicon.ico (32x32)');
  } catch (error) {
    console.error('Failed to generate favicon.ico:', error.message);
  }

  console.log('\nIcon generation complete!');
}

generateIcons();
