#!/usr/bin/env node
/**
 * Render assets/icon.svg into PNG sizes and macOS icon.icns.
 * Requires macOS (sips + iconutil) or librsvg (rsvg-convert).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const ASSETS = path.join(ROOT, 'assets');
const SVG = path.join(ASSETS, 'icon.svg');
const ICONSET = path.join(ASSETS, 'icon.iconset');

const SIZES = [16, 32, 64, 128, 256, 512, 1024];

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts });
}

function has(cmd) {
  return spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0;
}

function renderMasterPng(outPath, size = 1024) {
  if (has('rsvg-convert')) {
    run(`rsvg-convert -w ${size} -h ${size} "${SVG}" -o "${outPath}"`);
    return;
  }
  if (process.platform === 'darwin' && has('qlmanage')) {
    const tmp = path.join(ASSETS, '.icon-render-tmp.png');
    run(`qlmanage -t -s ${size} -o "${ASSETS}" "${SVG}"`, { stdio: 'ignore' });
    const generated = path.join(ASSETS, `${path.basename(SVG)}.png`);
    if (fs.existsSync(generated)) {
      fs.renameSync(generated, outPath);
      return;
    }
  }
  throw new Error(
    'No SVG renderer found. Install librsvg (brew install librsvg) or run on macOS with qlmanage.'
  );
}

function resizeWithSips(src, dest, size) {
  fs.copyFileSync(src, dest);
  run(`sips -z ${size} ${size} "${dest}" >/dev/null`);
}

function main() {
  if (!fs.existsSync(SVG)) {
    console.error('Missing assets/icon.svg');
    process.exit(1);
  }

  const master = path.join(ASSETS, 'icon-1024.png');
  renderMasterPng(master, 1024);
  console.log('✅ Rendered', master);

  fs.copyFileSync(master, path.join(ASSETS, 'icon.png'));
  console.log('✅ Copied assets/icon.png');

  if (fs.existsSync(ICONSET)) fs.rmSync(ICONSET, { recursive: true, force: true });
  fs.mkdirSync(ICONSET, { recursive: true });

  for (const size of SIZES) {
    const name = size === 1024 ? 'icon_512x512@2x.png' : `icon_${size}x${size}.png`;
    const out = path.join(ICONSET, name);
    resizeWithSips(master, out, size);
    if (size <= 256 && size * 2 <= 1024) {
      const retina = path.join(ICONSET, `icon_${size}x${size}@2x.png`);
      resizeWithSips(master, retina, size * 2);
    }
  }
  console.log('✅ Built icon.iconset');

  if (process.platform === 'darwin' && has('iconutil')) {
    run(`iconutil -c icns "${ICONSET}" -o "${path.join(ASSETS, 'icon.icns')}"`);
    console.log('✅ Built assets/icon.icns');
    fs.rmSync(ICONSET, { recursive: true, force: true });
  } else {
    console.log('ℹ️  iconutil not available — icon.iconset left for manual conversion');
  }
}

main();
