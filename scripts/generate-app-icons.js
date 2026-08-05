const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const input = path.join(root, 'assets', 'icon.png');
const outputDir = path.join(root, 'build');
const iconPng = path.join(outputDir, 'icon.png');
const iconsetDir = path.join(outputDir, 'icon.iconset');
const iconIco = path.join(outputDir, 'icon.ico');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
}

function pngSizeByte(size) {
  return size >= 256 ? 0 : size;
}

function createIco(entries) {
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + entries.length * entrySize;

  const header = Buffer.alloc(offset);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  for (let index = 0; index < entries.length; index += 1) {
    const { size, bytes } = entries[index];
    const cursor = headerSize + index * entrySize;
    header.writeUInt8(pngSizeByte(size), cursor);
    header.writeUInt8(pngSizeByte(size), cursor + 1);
    header.writeUInt8(0, cursor + 2);
    header.writeUInt8(0, cursor + 3);
    header.writeUInt16LE(1, cursor + 4);
    header.writeUInt16LE(32, cursor + 6);
    header.writeUInt32LE(bytes.length, cursor + 8);
    header.writeUInt32LE(offset, cursor + 12);
    offset += bytes.length;
  }

  return Buffer.concat([header, ...entries.map((entry) => entry.bytes)]);
}

if (!fs.existsSync(input)) {
  throw new Error(`Missing source icon image: ${input}`);
}

fs.mkdirSync(outputDir, { recursive: true });
fs.rmSync(iconsetDir, { recursive: true, force: true });
fs.mkdirSync(iconsetDir, { recursive: true });

const normalizedPng = path.join(outputDir, '.icon-1024.png');
run('sips', ['-Z', '1024', input, '--out', normalizedPng]);
run('sips', ['--padToHeightWidth', '1024', '1024', '--padColor', 'FFFFFF', normalizedPng, '--out', iconPng]);
fs.rmSync(normalizedPng, { force: true });

const iconsetSizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

for (const [filename, size] of iconsetSizes) {
  run('sips', ['-z', String(size), String(size), iconPng, '--out', path.join(iconsetDir, filename)]);
}

try {
  run('iconutil', ['-c', 'icns', iconsetDir, '-o', path.join(outputDir, 'icon.icns')]);
} catch (_error) {
  console.warn('Skipping icon.icns; electron-builder can use build/icon.png as the source icon.');
}
fs.rmSync(iconsetDir, { recursive: true, force: true });

const icoEntries = [];
for (const size of [16, 32, 48, 64, 128, 256]) {
  const icoPng = path.join(outputDir, `.icon-${size}.png`);
  run('sips', ['-z', String(size), String(size), iconPng, '--out', icoPng]);
  icoEntries.push({ size, bytes: fs.readFileSync(icoPng) });
  fs.rmSync(icoPng, { force: true });
}

fs.writeFileSync(iconIco, createIco(icoEntries));

console.log(`Wrote ${path.relative(root, iconPng)}`);
console.log(`Wrote ${path.relative(root, iconIco)}`);
