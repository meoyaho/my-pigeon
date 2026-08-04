const fs = require('fs');
const path = require('path');

// 16x16 solid gray PNG, hand-encoded minimal PNG bytes are impractical here,
// so we draw it with a tiny canvas-free PNG writer is overkill for a placeholder.
// Simplest reliable approach: write a 1x1 transparent PNG and let macOS/Windows
// scale it; Electron accepts any valid PNG for tray icons.
const onePixelTransparentPng = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6360000002000155a8f9500000000049454e44ae426082',
  'hex'
);
fs.mkdirSync(path.join(__dirname, '..', 'assets'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'tray-icon.png'), onePixelTransparentPng);
console.log('tray-icon.png written');
