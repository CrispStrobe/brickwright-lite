#!/usr/bin/env node
/**
 * The second reading of a screenshot run — pixels, not file count.
 *
 * capture.mjs asserts a WITNESS per scene before the shutter: a string that can
 * only be on screen if the thing actually happened. This is the independent
 * check, and it is the one that still runs when the witness logic itself rots:
 * it reads the PNG header for the real dimensions and the file size for
 * evidence that something was drawn, because a blank render compresses to
 * almost nothing.
 *
 *   node scripts/appstore/verify-shots.mjs <dir>
 */
import {readFileSync, statSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {DEVICES, LOCALES, SCENES} from './scenes.mjs';

const dir = path.resolve(process.argv[2] || 'appstore-shots');
const manifestPath = path.join(dir, 'manifest.json');
if (!existsSync(manifestPath)) {
    console.error(`no manifest at ${manifestPath} — the capture did not run`);
    process.exit(1);
}
const rows = JSON.parse(readFileSync(manifestPath, 'utf8'));
const byType = Object.fromEntries(DEVICES.map(d => [d.displayType, d.pixels]));

/** PNG stores width and height as big-endian uint32 at offset 16. */
const pngSize = buf => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

/** A blank editor compresses to almost nothing; a real screen does not. */
const MIN_BYTES = 40_000;

const problems = [];
if (!rows.length) problems.push('the manifest is empty');

for (const row of rows) {
    const file = path.join(dir, row.name);
    if (!existsSync(file)) { problems.push(`${row.name}: in the manifest, not on disk`); continue; }
    const buf = readFileSync(file);
    if (buf.subarray(0, 8).toString('binary') !== '\x89PNG\r\n\x1a\n') {
        problems.push(`${row.name}: not a PNG`);
        continue;
    }
    const [w, h] = pngSize(buf);
    const want = byType[row.displayType];
    if (!want) problems.push(`${row.name}: unknown displayType ${row.displayType}`);
    else if (w !== want[0] || h !== want[1]) {
        problems.push(`${row.name}: ${w}x${h}, but ${row.displayType} must be ${want[0]}x${want[1]}`);
    }
    const bytes = statSync(file).size;
    if (bytes < MIN_BYTES) problems.push(`${row.name}: ${bytes} bytes — too small to be a rendered screen`);
    if (!LOCALES.includes(row.locale)) problems.push(`${row.name}: locale ${row.locale} is not in the listing`);
    if (!row.caption) problems.push(`${row.name}: no caption`);
}

// EVERY LOCALE MUST BE PRESENT FOR EVERY SCENE CAPTURED. A run where German
// silently produced nothing (the first one did — the Code tab is "Skripte")
// would otherwise pass as "all files valid".
const scenes = [...new Set(rows.map(r => r.scene))];
for (const scene of scenes) {
    for (const device of DEVICES) {
        for (const locale of LOCALES) {
            const def = SCENES.find(x => x.id === scene);
            if (def && (def.skipDevices || []).includes(device.suffix)) continue;
            const has = rows.some(r => r.scene === scene && r.locale === locale &&
                r.displayType === device.displayType);
            if (!has) problems.push(`missing: ${scene} / ${device.suffix} / ${locale}`);
        }
    }
}

// DIFFERENT SCENES MUST LOOK DIFFERENT, and until this existed they did not
// have to. Six FPGA shots were photographs of the Blocks palette — the witness
// matched a panel that is in the DOM while another tab is on screen
// (forceRenderTabPanel). Every check above passed them: right size, valid PNG,
// over the byte floor. Only "this is the same picture as another scene" catches
// that, and it is cheap: identical content hashes to the same digest.
const byShape = new Map();
for (const row of rows) {
    const file = path.join(dir, row.name);
    if (!existsSync(file)) continue;
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    const key = `${row.displayType} ${row.locale}`;
    if (!byShape.has(key)) byShape.set(key, new Map());
    const seen = byShape.get(key);
    if (seen.has(digest)) {
        problems.push(`${row.name} is byte-identical to ${seen.get(digest)} — `
            + 'two scenes captured the same view');
    } else {
        seen.set(digest, row.name);
    }
}

console.log(`${rows.length} screenshot(s) across ${scenes.length} scene(s), ${DEVICES.length} device(s), ${LOCALES.length} locale(s)`);
if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
}
console.log('every screenshot is a real, correctly sized, captioned render');
