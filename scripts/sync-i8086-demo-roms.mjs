/**
 * Provenance for the vendored 8086 DEMO ROMs.
 *
 * WHY THIS IS A SIBLING OF sync-i8086-bios.mjs AND NOT A MODE OF IT. That
 * script is built around ONE artefact that has a SOURCE: it assembles
 * rom/bios.asm with lite's own vendored assembler, identifies which upstream
 * commit reproduces the committed bytes by replaying history, and verifies the
 * reset vector at FFFF:0000. None of that applies here. These seven are
 * pre-built binaries with no .asm beside them, no assembler step, and no reset
 * vector to check — they are loaded into a slot, not booted from the top of
 * memory. Folding them in would mean bending a single-artefact tool around a
 * concept it does not share, and the "identify by replay" mode would be dead
 * code for every one of them. Two honest scripts beat one that is two things.
 *
 * WHAT THIS RECORDS, per ROM: the upstream path it came from, the pin it was
 * taken at, its byte length and its sha256. That is the whole provenance
 * question for a pre-built blob — where did these bytes come from, and are they
 * still those bytes.
 *
 * THE DEFECT THIS CLOSES. CircuitDesigner.jsx offers fifteen preset ROMs and
 * loads them as `static/roms/${p.rom}`. Seven of the fifteen were not there:
 * cga-gfx, vga, hercules, ega, keyboard, desk and blink all 404'd, so seven
 * buttons in the shipped UI did nothing. Found by brickwright-lite-ea while
 * measuring P6. No census saw it because the path is CONSTRUCTED at the call
 * site — a grep for literal paths cannot find a template, so the by-name check
 * was answering a different question than the loader asks.
 *
 *   node scripts/sync-i8086-demo-roms.mjs --dir <bw-board>            # compare
 *   node scripts/sync-i8086-demo-roms.mjs --dir <bw-board> --write    # vendor + record
 */

// WHAT THIS SHIPS, for THIRD-PARTY-NOTICES.md: test/notices-drift.test.mjs reads this
// declaration (strict JSON) from every sync script that places an artifact under static/,
// and fails by name when the notices do not carry the name, licence and holder.
export const NOTICE = {"name":"bw-board ROMs","licence":"MIT","holder":"CrispStrobe"};
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const ROMS = path.join(repo, 'overlay', 'scratch-gui', 'static', 'roms');
const MANIFEST = path.join(ROMS, 'i8086-demos.provenance.json');

/** upstream rom/<name>.bin  ->  vendored i8086-<name>.bin */
const DEMOS = [
    'blink-demo', 'cga-gfx-demo', 'desk-demo', 'ega-demo',
    'hercules-demo', 'keyboard-demo', 'vga-demo',
];

const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : null;
};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const dir = arg('--dir');
const write = process.argv.includes('--write');
if (!dir) {
    console.error('usage: node scripts/sync-i8086-demo-roms.mjs --dir <bw-board> [--write]');
    process.exit(2);
}

const pin = JSON.parse(await readFile(path.join(repo, 'vendor-pins.json'), 'utf8'))['bw-board'];
if (!pin) { console.error('no bw-board pin recorded'); process.exit(2); }

// AT THE PIN, NOT AT THE CHECKOUT'S HEAD. The vendored engine is the pin's, so
// a demo ROM taken from a newer head would be paired with a machine that never
// ran it. `git show <pin>:<path>` rather than reading the working tree.
const atPin = async (rel) => {
    const { stdout } = await execFileP('git', ['-C', dir, 'show', `${pin}:${rel}`],
        { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
    return stdout;
};

const rows = [];
let differ = 0;
for (const name of DEMOS) {
    const upstreamRel = `rom/${name}.bin`;
    const vendored = path.join(ROMS, `i8086-${name}.bin`);
    let up;
    try { up = await atPin(upstreamRel); } catch (e) {
        console.error(`  MISSING upstream ${upstreamRel} at ${pin.slice(0, 9)}: ${e.message.split('\n')[0]}`);
        differ++;
        continue;
    }
    const have = await readFile(vendored).catch(() => null);
    const same = have !== null && have.equals(up);
    if (!same) differ++;
    console.log(`  ${same ? 'ok   ' : write ? 'wrote' : 'DIFFERS'} i8086-${name}.bin  ${up.length} bytes  ${sha256(up).slice(0, 16)}`);
    if (!same && write) await writeFile(vendored, up);
    rows.push({
        rom: `i8086-${name}.bin`,
        upstream: upstreamRel,
        bytes: up.length,
        sha256: sha256(up),
    });
}

if (write) {
    await writeFile(MANIFEST, `${JSON.stringify({
        note: 'Pre-built 8086 demo ROMs vendored from bw-board. See scripts/sync-i8086-demo-roms.mjs.',
        pinAtBuild: pin,
        roms: rows,
    }, null, 2)}\n`);
    console.log(`\nManifest written: ${path.relative(repo, MANIFEST)} (${rows.length} ROMs at ${pin.slice(0, 9)})`);
} else if (differ) {
    console.error(`\n${differ} demo ROM(s) differ from bw-board@${pin.slice(0, 9)}. --write to vendor them.`);
    process.exit(1);
} else {
    console.log(`\nall ${rows.length} demo ROMs match bw-board@${pin.slice(0, 9)}.`);
}
