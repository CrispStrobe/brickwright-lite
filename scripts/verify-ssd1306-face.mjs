#!/usr/bin/env node
/**
 * Acceptance: ssd1306 OLED face handler is present in the lite build.
 *
 * Root cause (2026-08-17): bw-cui2 reported the SvgParts handler "never
 * vendor-forwarded." Investigation found it IS present at every layer:
 *   - Source: BoardCanvas.jsx case 'ssd1306' (line ~609)
 *   - Sidecar: parts-data/ssd1306.json (4 terminals)
 *   - Device: bw-board/devices/ssd1306.js (I2C OLED model)
 *   - Registration: register-all.js → registerSSD1306()
 *   - Built chunk: 2× case 'ssd1306' in bw-circuit-ui.js
 *
 * Actual root cause: the production build was stale — index.html referenced
 * gui.7108cecf.js but only gui.6e3e7a38.js existed. The app wouldn't boot
 * at all in production, masking ALL rendering including ssd1306. Rebuild
 * fixed it.
 *
 * This gate verifies the handler is in the built chunk and the build
 * is internally consistent (index.html references chunks that exist).
 *
 *   node scripts/verify-ssd1306-face.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

// 1. Build exists
check('build directory exists', existsSync(join(build, 'index.html')));

// 2. Index.html references a gui chunk that exists
const indexHtml = readFileSync(join(build, 'index.html'), 'utf8');
const guiMatch = indexHtml.match(/src="(gui\.[a-f0-9]+\.js)"/);
check('index.html references a gui chunk', !!guiMatch, guiMatch?.[1] || 'not found');
if (guiMatch) {
  check('gui chunk file exists', existsSync(join(build, guiMatch[1])),
    guiMatch[1]);
}

// 3. bw-circuit-ui chunk contains ssd1306 handler
const cuiChunk = join(build, 'chunks', 'bw-circuit-ui.js');
check('bw-circuit-ui chunk exists', existsSync(cuiChunk));
if (existsSync(cuiChunk)) {
  const cui = readFileSync(cuiChunk, 'utf8');
  const caseCount = (cui.match(/case 'ssd1306'/g) || []).length;
  check('ssd1306 case handlers in built chunk', caseCount >= 2,
    `${caseCount} case 'ssd1306' matches (expect >=2: pin-offsets + SVG face)`);
  check('ssd1306 PCB fill color in chunk', cui.includes('#0a0a1e'),
    '#0a0a1e = the OLED PCB body color');
  check('ssd1306 framebuffer rendering in chunk',
    cui.includes('128') && cui.includes('page * 8'),
    '128×64 pixel decode loop');
}

// 4. bw-board chunk contains ssd1306 device
const boardChunk = join(build, 'chunks', 'bw-board.js');
check('bw-board chunk exists', existsSync(boardChunk));
if (existsSync(boardChunk)) {
  const board = readFileSync(boardChunk, 'utf8');
  check('ssd1306 device registered in board chunk', board.includes('ssd1306'),
    'device model present');
}

// 5. Source/overlay consistency
const srcHandler = join(root, 'overlay', 'scratch-gui', 'src', 'lib',
  'bw-circuit-ui', 'components', 'BoardCanvas.jsx');
if (existsSync(srcHandler)) {
  const src = readFileSync(srcHandler, 'utf8');
  check('ssd1306 case in overlay source', src.includes("case 'ssd1306'"));
}

const sidecar = join(root, 'overlay', 'scratch-gui', 'src', 'lib',
  'bw-circuit-ui', 'parts-data', 'ssd1306.json');
check('ssd1306 sidecar JSON exists', existsSync(sidecar));

if (failures.length) {
  console.log(`\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
} else {
  console.log('\nAll checks passed — ssd1306 OLED face handler is present in the lite build.');
}
