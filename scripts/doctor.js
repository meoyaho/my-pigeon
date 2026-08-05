const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function versionAtLeast(actual, expected) {
  const actualParts = actual.split('.').map(Number);
  const expectedParts = expected.split('.').map(Number);

  for (let i = 0; i < expectedParts.length; i += 1) {
    const actualPart = actualParts[i] || 0;
    const expectedPart = expectedParts[i] || 0;
    if (actualPart > expectedPart) return true;
    if (actualPart < expectedPart) return false;
  }
  return true;
}

function npmVersion() {
  const result = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

const checks = [
  {
    label: 'Node.js >= 20',
    ok: versionAtLeast(process.versions.node, '20.0.0'),
    help: `Installed Node.js is ${process.versions.node}. Install Node.js 20 LTS or newer.`,
  },
  {
    label: 'npm is available',
    ok: Boolean(npmVersion()),
    help: 'Install Node.js from https://nodejs.org/ so npm is available too.',
  },
  {
    label: 'Dependencies are installed',
    ok: exists('node_modules/electron') && exists('node_modules/pixi.js'),
    help: 'Run: npm install',
  },
  {
    label: 'Electron entry file exists',
    ok: exists('electron/main.js'),
    help: 'electron/main.js is missing.',
  },
  {
    label: 'Renderer entry file exists',
    ok: exists('renderer/index.html'),
    help: 'renderer/index.html is missing.',
  },
  {
    label: 'Tray icon exists',
    ok: exists('assets/tray-icon.png'),
    help: 'Run: node scripts/generate-tray-icon.js',
  },
];

let hasFailure = false;

console.log('Desktop Pigeon Pet readiness check\n');

for (const check of checks) {
  const mark = check.ok ? 'OK  ' : 'FAIL';
  console.log(`${mark} ${check.label}`);
  if (!check.ok) {
    hasFailure = true;
    console.log(`     ${check.help}`);
  }
}

console.log('');

if (hasFailure) {
  console.log('Fix the FAIL items above, then run: npm start');
  process.exit(1);
}

console.log('Ready. Run: npm start');
