const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'fixture');
const target = path.join(root, 'dist');

if (!fs.existsSync(source)) {
  console.error(`build failed: no fixture/ directory at ${source} — the build copies fixture/ to dist/, so the fixture site must exist first`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
console.log(`built ${path.relative(root, source)} -> ${path.relative(root, target)}`);
