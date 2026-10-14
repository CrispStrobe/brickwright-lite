/**
 * The app icon that actually ships.
 *
 * TestFlight builds carried TAURI'S OWN logo, not the Brickwright robot, from
 * the first iOS build until 0.1.10. Two independent causes, and this file gates
 * both — neither is visible to any other test, because an icon is the one asset
 * nothing asserts on and everybody sees.
 *
 *   1. `tauri ios init` / `tauri android init` template their default icon into
 *      `gen/` and never look at `src-tauri/icons/`. `gen/` is gitignored, so CI
 *      regenerated it — and the default — on every run. Fixed by
 *      apps/tauri/scripts/patch-mobile-icons.mjs, which the workflow must call:
 *      writing the icons and never installing them is the same shape of failure
 *      as writing tester notes and never sending them.
 *
 *   2. The artwork is a rounded rectangle whose corners are painted OPAQUE WHITE
 *      (not transparent — the alpha channel is present and entirely opaque,
 *      which is its own problem: ITMS-90717 rejects an app icon that merely HAS
 *      an alpha channel). iOS masks icons itself, so it needs a full-bleed
 *      opaque square. scripts/make-ios-icons.mjs produces that.
 *
 * PNGs are read here without an image library, so the gate has no dependency the
 * repo does not already have: IHDR gives the size and colour type, and the very
 * first pixel is recoverable from the first inflated scanline because every PNG
 * filter degenerates to identity there (the pixels above and to the left are
 * both outside the image, so both are treated as zero).
 */
import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const iosIcons = resolve(here, '../apps/tauri/src-tauri/icons/ios');

/** PNG colour types we care about. 2 = truecolour, 6 = truecolour + alpha. */
const RGB = 2;
const RGBA = 6;

const readPng = file => {
    const buf = readFileSync(file);
    assert.equal(buf.readUInt32BE(0), 0x89504e47, `${file} is not a PNG`);
    const ihdr = {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
        bitDepth: buf[24],
        colorType: buf[25]
    };
    // Concatenate the IDAT chunks, then inflate just enough for scanline 0.
    const idat = [];
    let at = 8;
    while (at < buf.length) {
        const len = buf.readUInt32BE(at);
        const type = buf.toString('ascii', at + 4, at + 8);
        if (type === 'IDAT') idat.push(buf.subarray(at + 8, at + 8 + len));
        if (type === 'IEND') break;
        at += len + 12;
    }
    const raw = inflateSync(Buffer.concat(idat));
    // raw[0] is scanline 0's filter byte; for its FIRST pixel every filter type
    // reduces to identity, so the bytes that follow are the pixel itself.
    const channels = ihdr.colorType === RGBA ? 4 : 3;
    const first = Array.from(raw.subarray(1, 1 + channels));
    return {...ihdr, firstPixel: first};
};

/** Exactly the names the generated AppIcon.appiconset's Contents.json lists. */
const EXPECTED = {
    'AppIcon-20x20@1x.png': 20,
    'AppIcon-20x20@2x.png': 40,
    'AppIcon-20x20@2x-1.png': 40,
    'AppIcon-20x20@3x.png': 60,
    'AppIcon-29x29@1x.png': 29,
    'AppIcon-29x29@2x.png': 58,
    'AppIcon-29x29@2x-1.png': 58,
    'AppIcon-29x29@3x.png': 87,
    'AppIcon-40x40@1x.png': 40,
    'AppIcon-40x40@2x.png': 80,
    'AppIcon-40x40@2x-1.png': 80,
    'AppIcon-40x40@3x.png': 120,
    'AppIcon-60x60@2x.png': 120,
    'AppIcon-60x60@3x.png': 180,
    'AppIcon-76x76@1x.png': 76,
    'AppIcon-76x76@2x.png': 152,
    'AppIcon-83.5x83.5@2x.png': 167,
    'AppIcon-512@2x.png': 1024
};

describe('the iOS app icon', () => {
    test('every size Xcode asks for is present, square, and the right pixels', () => {
        for (const [name, size] of Object.entries(EXPECTED)) {
            const file = join(iosIcons, name);
            assert.ok(existsSync(file), `${name} is missing from icons/ios/`);
            const png = readPng(file);
            assert.equal(png.width, size, `${name} is ${png.width}px, Contents.json wants ${size}`);
            assert.equal(png.height, size, `${name} is not square`);
        }
    });

    test('no alpha channel anywhere — App Store Connect rejects one outright', () => {
        for (const name of Object.keys(EXPECTED)) {
            const png = readPng(join(iosIcons, name));
            assert.equal(png.colorType, RGB,
                `${name} has colour type ${png.colorType}; iOS icons must be RGB with no alpha ` +
                '(ITMS-90717 fires on the channel being present, opaque or not)');
        }
    });

    test('the artwork bleeds to the edge instead of being pre-rounded', () => {
        // iOS applies its own superellipse mask. A pre-rounded icon shows white
        // slivers where the two curves disagree, which is what the source
        // artwork — white corners, not transparent ones — would have produced.
        for (const name of Object.keys(EXPECTED)) {
            const [r, g, b] = readPng(join(iosIcons, name)).firstPixel;
            assert.ok(!(r > 244 && g > 244 && b > 244),
                `${name}'s top-left pixel is ${r},${g},${b} — near-white, so the rounded ` +
                'corners are still painted on. Re-run scripts/make-ios-icons.mjs.');
        }
    });

    test('it is the robot: teal background, not Tauri\'s white', () => {
        // Tauri's default logo sits on white; ours is the teal gradient. One
        // pixel separates them, and it is the pixel that was wrong on TestFlight.
        const [r, g, b] = readPng(join(iosIcons, 'AppIcon-512@2x.png')).firstPixel;
        assert.ok(b > r && g > r && b > 120,
            `the marketing icon's corner is ${r},${g},${b} — that is not the robot's teal`);
    });
});

describe('the icons reach the build', () => {
    const workflow = readFileSync(resolve(here, '../.github/workflows/mobile.yml'), 'utf8');

    // The property that matters is not "the robot is in the repo" — it was, for
    // seven weeks, while every build shipped Tauri's logo. It is that something
    // installs it after the generator has overwritten it.
    // Asserted PER JOB, not as a global count. This read `[['ios', 2], ['android', 1]]`
    // and broke the moment a third iOS job was added in 615ad03c0 — the count was
    // stale, nothing was wrong with the workflow, and main went red for a day.
    //
    // Counting calls never expressed the property anyway: three patch calls all
    // sitting in one job would have satisfied it while two other jobs shipped
    // Tauri's logo. The comment above already said what matters — "something
    // installs it AFTER the generator has overwritten it" — so that is what this
    // now checks, job by job, and it cannot go stale when a job is added.
    const jobsOf = text => {
        const lines = text.split('\n');
        const heads = lines
            .map((line, i) => [i, /^  ([a-z][a-z0-9-]*):$/.exec(line)])
            .filter(([, m]) => m)
            .map(([i, m]) => [i, m[1]]);
        return heads.map(([start, name], k) => [
            name,
            lines.slice(start, k + 1 < heads.length ? heads[k + 1][0] : lines.length).join('\n')
        ]);
    };

    for (const platform of ['ios', 'android']) {
        test(`every job that runs \`tauri ${platform} init\` puts our icon back`, () => {
            const offenders = jobsOf(workflow)
                .filter(([, body]) => body.includes(`tauri ${platform} init`))
                .filter(([, body]) => !body.includes(`node scripts/patch-mobile-icons.mjs ${platform}`))
                .map(([name]) => name);
            assert.deepEqual(offenders, [],
                `these jobs run \`tauri ${platform} init\` and never reinstall the icon, so they ` +
                `ship Tauri's default logo: ${offenders.join(', ')}`);
        });
    }

    test(`the ${'icon'} patch is not merely present somewhere in the file`, () => {
        // The old shape would have passed with every patch call in one job. Prove
        // the new one distinguishes that: a synthetic workflow with two init jobs
        // and both patches in the first must be rejected.
        const synthetic = [
            'jobs:', '  a:', '    steps:', '      - run: tauri ios init',
            '      - run: node scripts/patch-mobile-icons.mjs ios',
            '      - run: node scripts/patch-mobile-icons.mjs ios',
            '  b:', '    steps:', '      - run: tauri ios init'
        ].join('\n');
        const offenders = jobsOf(synthetic)
            .filter(([, body]) => body.includes('tauri ios init'))
            .filter(([, body]) => !body.includes('node scripts/patch-mobile-icons.mjs ios'))
            .map(([name]) => name);
        assert.deepEqual(offenders, ['b'],
            'the per-job check does not notice a job that inits without patching');
    });

    test('mobile.yml checks the icon survived into the built app', () => {
        assert.match(workflow, /no AppIcon\*\.png in the IPA/,
            'the signed job no longer asserts the IPA has an app icon');
        assert.match(workflow, /the app icon set is not ours/,
            'the simulator job no longer asserts the asset catalog is ours');
    });
});
