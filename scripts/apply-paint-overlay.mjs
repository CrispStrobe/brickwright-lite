#!/usr/bin/env node
// Lay our owned scratch-paint delta (the extended costume designer) over the installed
// node_modules/scratch-paint. Run AFTER `npm install`, BEFORE `npm run build`.
//
// Same reasoning as apply-vm-overlay.mjs: scratch-paint stays a normal pinned NPM dep so all of
// its transitive deps (@scratch/paper, react-intl, ...) hoist into scratch-gui/node_modules, and
// we overlay our src changes in place afterwards. webpack resolves the package through its
// `browser` field (./src/index.js), so an overlay onto src/ lands in the bundle.
//
// overlay/scratch-paint/ is the editable source of truth — edit there and rebuild.
import { cpSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'overlay', 'scratch-paint');
const DEST = path.join(ROOT, 'packages', 'scratch-gui', 'node_modules', 'scratch-paint');

// The overlay is a set of FULL FILE COPIES authored against one exact base version. If npm ever
// resolves a different scratch-paint, the un-overlaid files around ours may have moved and the
// result is a silently broken editor rather than a build error — so fail loudly instead.
const EXPECTED_VERSION = '2.2.518';

if (!existsSync(DEST)) {
    console.error(`node_modules/scratch-paint missing at ${DEST} — run npm install first.`);
    process.exit(1);
}

const version = JSON.parse(readFileSync(path.join(DEST, 'package.json'), 'utf8')).version;
if (version !== EXPECTED_VERSION) {
    console.error(`  ! scratch-paint is ${version}, overlay was authored against ${EXPECTED_VERSION}.`);
    console.error('    Re-author overlay/scratch-paint against the new base, then bump');
    console.error('    EXPECTED_VERSION here and the pin in integrate.mjs.');
    process.exit(1);
}

cpSync(SRC, DEST, { recursive: true });
console.log(`  applied scratch-paint overlay onto node_modules/scratch-paint@${version}`);
