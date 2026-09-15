#!/usr/bin/env node
// Parse the JSX that NO BUILD COMPILES.
//
// The FPGA surface is behind a build-time BW_ENABLE_FPGA that is off in every
// shipped build, and webpack genuinely drops it: CI's github-pages artifact was
// grepped for six strings distinctive to the surface and none appears in 123 MB
// of output. That is the feature AND the hole -- webpack never parses
// fpga-tab.jsx here, so a JSX syntax error or a bad prop would sit undetected
// until somebody turned the flag on, possibly months later.
//
// test/fpga-surface-flag.test.mjs already checks every import resolves, which is
// the likeliest breakage and costs nothing. This is the other half: does the
// file actually PARSE. It runs in the build job, which already has the GUI's
// babel installed, so it costs seconds rather than a second full build -- the
// reason a whole flag-on build job was not added to a repo that counts its
// build slots.
//
// Deliberately parse-only. It does not typecheck, lint, or render.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
    'overlay/scratch-gui/src/components/tw-pseudocode/fpga-tab.jsx',
];

// Babel lives in the prepared GUI tree, not at the root.
const guiRequire = createRequire(path.join(ROOT, 'packages/scratch-gui/package.json'));
let parse;
try {
    ({parse} = guiRequire('@babel/parser'));
} catch {
    console.error('check-flagged-jsx: @babel/parser is not resolvable from packages/scratch-gui.');
    console.error('Run this after the GUI install step, or it cannot do its job.');
    process.exit(2);
}

let failed = 0;
for (const rel of FILES) {
    const abs = path.join(ROOT, rel);
    let source;
    try {
        source = readFileSync(abs, 'utf8');
    } catch {
        console.error(`MISSING  ${rel} — the flagged surface is gone; update this list or restore it.`);
        failed++;
        continue;
    }
    try {
        parse(source, {sourceType: 'module', plugins: ['jsx'], errorRecovery: false});
        console.log(`ok       ${rel}`);
    } catch (e) {
        const at = e.loc ? `${e.loc.line}:${e.loc.column}` : '?';
        console.error(`FAILED   ${rel}:${at} — ${e.message}`);
        failed++;
    }
}

if (failed) {
    console.error(`\n${failed} flagged file(s) do not parse. No shipped build would have told you:`);
    console.error('BW_ENABLE_FPGA is off everywhere, so webpack never reads them.');
    process.exit(1);
}
console.log(`\n${FILES.length} flagged file(s) parse. They are compiled by no build, so this is the only check.`);
