#!/usr/bin/env node
// Lay our owned scratch-vm delta (built-in extensions + their registration in the builtinExtensions
// map) over the installed node_modules/scratch-vm. Run AFTER `npm install`, BEFORE `npm run build`.
//
// Why post-install instead of a file:../scratch-vm package: a file: symlink makes npm skip
// installing scratch-vm's own transitive deps (format-message, etc.), so the from-source build
// can't resolve them. Keeping scratch-vm as a normal pinned NPM dep gets all deps hoisted into
// scratch-gui/node_modules; we then overlay our src changes in place. overlay/scratch-vm/ is the
// editable source of truth — edit there and rebuild.
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'overlay', 'scratch-vm');
const DEST = path.join(ROOT, 'packages', 'scratch-gui', 'node_modules', 'scratch-vm');

if (!existsSync(DEST)) {
    console.error(`node_modules/scratch-vm missing at ${DEST} — run npm install first.`);
    process.exit(1);
}
cpSync(SRC, DEST, { recursive: true });
console.log('  applied scratch-vm overlay onto node_modules/scratch-vm (built-in extensions)');
