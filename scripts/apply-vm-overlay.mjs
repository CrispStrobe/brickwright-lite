#!/usr/bin/env node
// Lay our owned scratch-vm delta (built-in extensions + their registration in the builtinExtensions
// map) over the installed node_modules/scratch-vm. Run AFTER `npm install`, BEFORE `npm run build`.
//
// Why post-install instead of a file:../scratch-vm package: a file: symlink makes npm skip
// installing scratch-vm's own transitive deps (format-message, etc.), so the from-source build
// can't resolve them. Keeping scratch-vm as a normal pinned NPM dep gets all deps hoisted into
// scratch-gui/node_modules; we then overlay our src changes in place. overlay/scratch-vm/ is the
// editable source of truth — edit there and rebuild.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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

// Upstream one-line bugfix (too small to justify carrying the whole 3000-line runtime.js as an
// overlay): the base VM builds the extension palette category as `<category name="${name}" ...>`
// with the RAW extension name. Any extension whose name contains & < > " (e.g. "Arrays & Tensors")
// produces not-well-formed toolbox XML, so scratch-blocks fails to build the category and the
// extension's blocks never appear. `xmlEscape` is already imported in runtime.js — wrap the name.
const runtimePath = path.join(DEST, 'src', 'engine', 'runtime.js');
let rt = readFileSync(runtimePath, 'utf8');
const anchor = '<category name="${name}" id="${';
if (rt.includes(anchor)) {
    rt = rt.replace(anchor, '<category name="${xmlEscape(name)}" id="${');
    writeFileSync(runtimePath, rt);
    console.log('  patched runtime.js (xmlEscape extension category name)');
} else if (rt.includes('<category name="${xmlEscape(name)}"')) {
    console.log('  runtime.js category-name escape already applied');
} else {
    console.error('  ! runtime.js category-name anchor not found — base VM version changed?');
    process.exit(1);
}

// Brickwright UI improvement (parity with the Scratch Foundation / Xcratch
// editor): accept full-width (double-byte) digits and signs as numbers, so
// "１２３" typed in a number field is used as 123. One-line change to
// Cast.toNumber — too small to vendor the whole cast.js as an overlay.
// Full-width ０-９ ＋ － ． all map to ASCII by subtracting 0xFEE0.
const castPath = path.join(DEST, 'src', 'util', 'cast.js');
let cast = readFileSync(castPath, 'utf8');
const castAnchor = '        const n = Number(value);';
const castPatched = '        // Brickwright: accept full-width (double-byte) digits/signs.\n' +
    '        const nv = (typeof value === \'string\') ?\n' +
    '            value.replace(/[\\uFF10-\\uFF19\\uFF0B\\uFF0D\\uFF0E]/g, ch =>\n' +
    '                String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) : value;\n' +
    '        const n = Number(nv);';
if (cast.includes('// Brickwright: accept full-width')) {
    console.log('  cast.js full-width number patch already applied');
} else if (cast.includes(castAnchor)) {
    cast = cast.replace(castAnchor, castPatched);
    writeFileSync(castPath, cast);
    console.log('  patched cast.js (full-width numbers)');
} else {
    console.error('  ! cast.js toNumber anchor not found — base VM version changed?');
    process.exit(1);
}
