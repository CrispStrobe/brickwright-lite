#!/usr/bin/env node
// Apply the Brickwright delta onto the vendored (BSD/Apache) Scratch stack.
//
// We are FROZEN on pinned versions (see vendor.mjs), so the pristine base never shifts under
// us. That means we can OWN our modified files outright instead of re-deriving edits with fragile
// string patches every build: `overlay/` holds full copies of every file we changed or added, and
// they simply replace the vendored originals. To change base behaviour, edit the file in overlay/.
//
// overlay/scratch-gui/  — Code tab (tw-pseudocode + sb3-creator libs), the 4th "Code ⇄ Blocks" tab
//   in gui.jsx, webpack.config.js (devtool:false + `scratch-vm`->src alias), de-branded render-gui
//   & stage-header (no scratch.mit.edu redirect), the extension-library picker, the SoundFX creator.
// overlay/scratch-vm/   — built-in extensions under src/extensions/crispstrobe/ + their registration
//   in extension-manager.js's builtinExtensions map.
//
// Idempotent; run after `vendor`.
import { cpSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GUI = path.join(ROOT, 'packages', 'scratch-gui');
if (!existsSync(GUI)) { console.error('Run `npm run vendor` first (packages/scratch-gui missing).'); process.exit(1); }

// 1) overlay our owned scratch-gui files onto the vendored source. (The scratch-vm delta lives
// in overlay/scratch-vm and is applied to node_modules/scratch-vm AFTER install by
// apply-vm-overlay.mjs — see step 3 for why it can't be a file: package.)
cpSync(path.join(ROOT, 'overlay', 'scratch-gui'), GUI, { recursive: true });
console.log('  overlaid scratch-gui delta (Code tab, SoundFX, de-brand, webpack, extension picker)');

// 2) micro:bit stub. Install runs with --ignore-scripts (upstream prepublish.mjs downloads
// micro:bit firmware from a flaky URL), so src/generated/microbit-hex-url.cjs is never created
// and webpack fails to resolve it. Only the firmware flasher path needs it; stub it empty.
const genDir = path.join(GUI, 'src', 'generated');
mkdirSync(genDir, { recursive: true });
writeFileSync(path.join(genDir, 'microbit-hex-url.cjs'), "module.exports = '';\n");
console.log('  wrote src/generated/microbit-hex-url.cjs stub');

// 3) package.json: our runtime deps + pin scratch-vm. We keep scratch-vm as a normal NPM dep
// (NOT file:../scratch-vm) so npm installs ALL of its transitive deps hoisted into
// scratch-gui/node_modules (a file: symlink makes npm skip installing the linked package's own
// deps — e.g. format-message — and the src build then can't resolve them). We then build the VM
// from source via a webpack alias (scratch-vm$ -> node_modules/scratch-vm/src) and lay our owned
// VM delta over node_modules/scratch-vm after install (apply-vm-overlay.mjs). Pin to the exact
// vendored version so the hoisted deps + dist/web match our overlay's base.
const pkgPath = path.join(GUI, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.dependencies.skulpt = pkg.dependencies.skulpt || '^1.2.0';   // in-browser Python (Code tab Run)
pkg.dependencies.jszip = pkg.dependencies.jszip || '^3.10.1';    // .sb3 read/write
pkg.dependencies['scratch-vm'] = '4.8.115';                      // last BSD-3; built from src via alias
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('  ensured deps (skulpt, jszip) + pinned scratch-vm@4.8.115');

console.log('Integration applied. `cd packages/scratch-gui && npm install --ignore-scripts && npm run build`.');
