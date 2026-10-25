/**
 * The App Store screenshot set, held to Apple's requirements and to itself.
 *
 * The listing copy has had a gate since 0.1.5 (test/app-store-metadata.test.mjs)
 * while the SCREENSHOTS — the part of the page a person actually looks at —
 * were unmanaged: whatever had been dragged into App Store Connect by hand, at
 * some unknown version. scripts/appstore/ renders them from the shipping build;
 * this holds the plan those scripts execute.
 *
 * It deliberately does NOT open a browser. The capture needs a built app and
 * runs in its own workflow; what can rot silently without one is the PLAN —
 * a size Apple no longer accepts, a scene with no caption in one language, a
 * locale the listing does not carry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {DEVICES, LOCALES, SCENES, scenesFor, shotList} from '../scripts/appstore/scenes.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * Apple's accepted sizes for the display types we upload, App Store Connect
 * 2026-09. A size is a FACT ABOUT APPLE, so it is written out here rather than
 * imported from the module under test — otherwise this asserts that a file
 * equals itself.
 */
const APPLE = {
    APP_IPHONE_67: [1320, 2868],
    APP_IPAD_PRO_3GEN_129: [2064, 2752],
    APP_DESKTOP: [2880, 1800]
};

test('every device is a display type Apple accepts, at the pixel size it requires', () => {
    for (const d of DEVICES) {
        assert.ok(APPLE[d.displayType], `${d.displayType} is not a display type this listing uploads`);
        assert.deepEqual(d.pixels, APPLE[d.displayType],
            `${d.suffix}: ${d.pixels.join('x')} is not what Apple wants for ${d.displayType}`);
        // The capture sets a POINT viewport and a scale factor; the product is
        // what lands in the PNG. A mismatch here is a screenshot Apple rejects
        // after the build has already been uploaded.
        // Rounded, because a device may be rendered at the app's own layout
        // width with the device's ASPECT ratio — iPhone is (see scenes.mjs) —
        // and that does not divide into whole points.
        assert.deepEqual(
            [Math.round(d.viewport.width * d.scale), Math.round(d.viewport.height * d.scale)],
            d.pixels,
            `${d.suffix}: viewport x scale does not produce ${d.pixels.join('x')}`);
    }
});

test('the iOS app record gets both an iPhone and an iPad set', () => {
    // Apple requires an iPhone set; an iPad set is required for an app that
    // claims iPad support, which this one does (the Tauri build ships
    // universal). A missing one is a submission blocked at review.
    const types = DEVICES.map(d => d.displayType);
    assert.ok(types.includes('APP_IPHONE_67'), 'no iPhone screenshots');
    assert.ok(types.includes('APP_IPAD_PRO_3GEN_129'), 'no iPad screenshots');
    assert.ok(types.includes('APP_DESKTOP'),
        'no Mac screenshots — release.yml uploads a macOS build to this same app record');
});

test('every scene is captioned in every locale the listing carries', () => {
    assert.ok(SCENES.length >= 4, `only ${SCENES.length} scenes — a listing wants a story, not a thumbnail`);
    const ids = SCENES.map(s => s.id);
    assert.deepEqual([...new Set(ids)], ids, 'two scenes share an id — their files would collide');
    for (const s of SCENES) {
        assert.match(s.id, /^\d\d-[a-z-]+$/, `${s.id}: ids are ordered, so the store shows them in order`);
        for (const loc of LOCALES) {
            const c = s.caption[loc];
            assert.ok(c && c.length > 8, `${s.id}: no ${loc} caption`);
            // Apple's promotional text limit is not the caption's, but a
            // caption nobody can read on a phone is not a caption.
            assert.ok(c.length <= 80, `${s.id}/${loc}: caption is ${c.length} chars, too long to read`);
        }
        assert.notEqual(s.caption['en-US'], s.caption['de-DE'],
            `${s.id}: the German caption is the English one`);
    }
});

test('the locales are the ones the listing copy is written in', () => {
    // docs/app-store-metadata.md is the source for the descriptions; capturing
    // a locale it has no copy for would produce a half-translated listing.
    const md = readFileSync(path.join(ROOT, 'docs/app-store-metadata.md'), 'utf8');
    for (const loc of LOCALES) {
        assert.ok(md.includes(`App Store description — ${loc}`),
            `${loc} screenshots would be captured for a listing with no ${loc} description`);
    }
});

test('a flag-off build captures fewer scenes, and says which', () => {
    // The FPGA tab only exists in a flag-on build. The scene list must degrade
    // rather than produce a shot of a tab that is not there.
    const on = scenesFor({fpga: true}).map(s => s.id);
    const off = scenesFor({fpga: false}).map(s => s.id);
    assert.ok(off.length < on.length, 'no scene is marked needsFpga — the flag is doing nothing');
    assert.ok(on.includes('05-fpga') && !off.includes('05-fpga'));
    // Summed per device, not multiplied: a scene may be unavailable on one
    // device (see skipDevices), so a flat product overcounts — it did, and
    // this assertion caught it the moment 04-machine opted out of iPhone.
    const expected = fpga => DEVICES.reduce(
        (n, d) => n + LOCALES.length * scenesFor({fpga, device: d.suffix}).length, 0);
    assert.equal(shotList({fpga: true}).length, expected(true));
    assert.equal(shotList({fpga: false}).length, expected(false));
    assert.ok(shotList({fpga: true}).length > shotList({fpga: false}).length);
});

test('a scene that cannot be captured on a device says so, with a reason in the docs', () => {
    // An empty allowlist would be the tidy-looking answer; a scene silently
    // absent from one device is how a listing ends up with three iPhone shots
    // and nobody noticing. Each exclusion must be visible here AND explained
    // where a person reads about the listing.
    const md = readFileSync(path.join(ROOT, 'docs/app-store-metadata.md'), 'utf8');
    const suffixes = DEVICES.map(d => d.suffix);
    for (const s of SCENES) {
        for (const skip of s.skipDevices || []) {
            assert.ok(suffixes.includes(skip), `${s.id}: skips '${skip}', which is not a device`);
            assert.ok(md.includes('Known limitation'),
                `${s.id} skips ${skip} but the metadata records no limitation`);
        }
        // A scene excluded everywhere is a scene that should be deleted.
        assert.notEqual((s.skipDevices || []).length, suffixes.length,
            `${s.id} is skipped on every device`);
    }
    // Whatever is excluded, every device must still get a usable set.
    for (const d of DEVICES) {
        const n = scenesFor({fpga: true, device: d.suffix}).length;
        assert.ok(n >= 3, `${d.suffix} would get only ${n} screenshot scene(s)`);
    }
});

test('every planned shot has a unique file name', () => {
    const names = shotList({fpga: true}).map(s => s.name);
    assert.deepEqual([...new Set(names)].sort(), [...names].sort(),
        'two shots would write to the same file — one would silently overwrite the other');
});

test('THE PLAN CAN FAIL: a wrong size, a missing caption and a copied one are all caught', () => {
    // Synthetic, so the assertions above cannot pass by accident.
    const bad = {...DEVICES[0], pixels: [1170, 2532]};
    assert.notDeepEqual(bad.pixels, APPLE[bad.displayType]);
    const scene = {id: '99-x', caption: {'en-US': 'Something long enough'}};
    assert.equal(scene.caption['de-DE'], undefined);
    const copied = {'en-US': 'Same words', 'de-DE': 'Same words'};
    assert.equal(copied['en-US'], copied['de-DE']);
});
