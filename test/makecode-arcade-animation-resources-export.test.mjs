import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import VendoredCreator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
import {decodeAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';
import {recoverAnimationCompanion, ANIMATION_COMPANION_PATH} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-companion.js';

// Producer qualification may use its exact reviewed source before consumer
// adoption. Normal CI uses the vendored pin; no parser source is copied here.
const Creator = process.env.SB3_CREATOR_DIR ? (await import(pathToFileURL(
    path.join(process.env.SB3_CREATOR_DIR, 'src/utils/sb3Creator.js')).href)).default : VendoredCreator;
const id = '12345678-1234-4234-8234-123456789abc';
const layer = pixels => ({id: 'base', name: 'Pixels', locked: false, type: 'pixel', visible: true, opacity: 1,
    content: {kind: 'pixels', value: {width: 2, height: 1, pixels}}});
const sourceDocument = () => {
    const frames = [
        {id: 'red', durationMs: 100, activeLayerId: 'base', layers: [layer([2, 2])]},
        {id: 'blue', durationMs: 100, activeLayerId: 'base', layers: [layer([8, 8])]}
    ];
    return {version: 4, layers: frames[0].layers, activeLayerId: 'base',
        animation: {resource: {id, name: 'Walk'}, activeFrameId: 'red', frames}};
};
const program = resource => `DEVICE ARCADE
GLOBAL actor
GLOBAL frames
GLOBAL again
GLOBAL interval
GLOBAL key = "${id}"
WHEN flag clicked:
  set frames to (arcade animation frames resource ${resource})
  set again to (arcade animation frames resource ${resource})
  arcade log (compare value (frames) op "===" with (again))
  arcade set image pixel (item 0 of array reference (frames)) x 0 y 0 color 7
  set interval to (arcade animation interval resource ${resource})
  set actor to (arcade create image (item 0 of array reference (frames)) template "" kind "Player")
  arcade set position of (actor) x 80 y 60
  arcade animate sprite (actor) frames (frames) interval (interval) loop (1 = 1)
`;

test('literal and computed resource IDs export shared typed images and original Arcade playback', async () => {
    for (const resource of [`"${id}"`, '(key)']) {
        const creator = new Creator(); creator.parse(program(resource));
        assert.deepEqual(creator.warnings, []);
        const exported = projectToArcade(creator.project, {animationDocuments: [sourceDocument()]});
        assert.deepEqual(exported.unsupported, []);
        assert.deepEqual(exported.warnings, []);
        assert.match(exported.ts, /let frames: Image\[\]/);
        assert.equal((exported.ts.match(/let __bwAnimationFrames0: Image\[\]/g) || []).length, 1);
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
        const observed = new Set();
        for (const ms of [75, 175, 275]) {
            const run = await runArcadeSim(compiled.outfiles['binary.js'], {ms});
            assert.equal(run.error, null);
            const screen = run.screen();
            const coloured = Array.from(screen.entries()).filter(([, colour]) => colour !== 0);
            assert.ok(screen[59 * 160 + 79], `expected centered two-pixel sprite at80,60; actual indexed pixels ${JSON.stringify(coloured.slice(0, 12))}; serial ${JSON.stringify(run.serial)}`);
            observed.add(screen[59 * 160 + 79]);
        }
        assert.deepEqual([...observed].sort(), [7, 8]);
        const logged = await runArcadeSim(compiled.outfiles['binary.js'], {ms: 75});
        assert.ok(logged.serial.some(entry => String(entry.text).includes('true')), 'repeated reporter calls share the same array');
        const imported = arcadeToPseudocode(exported.files);
        assert.deepEqual(imported.unsupported, [], 'actual emitted original program remains importable');
        const second = new Creator(); second.parse(imported.code);
        assert.deepEqual(second.warnings, []);
    }
});

test('missing and duplicate resources remain named export refusals', () => {
    const creator = new Creator(); creator.parse(program(`"${id}"`));
    assert.ok(projectToArcade(creator.project).unsupported.some(message => message.includes('Animation resource unavailable')));
    const duplicate = projectToArcade(creator.project, {animationDocuments: [sourceDocument(), sourceDocument()]});
    assert.ok(duplicate.unsupported.some(message => message.includes('Duplicate animation resource ID')));
    const unequal = sourceDocument(); unequal.animation.frames[1].durationMs = 200;
    assert.ok(projectToArcade(creator.project, {animationDocuments: [unequal]}).unsupported.some(message => message.includes('equal frame durations')));
});


test('computed missing IDs preserve undefined results and report names in original execution', async () => {
  for (const operation of ['frames', 'fresh frames', 'interval']) {
    const creator = new Creator();
    creator.parse(`DEVICE ARCADE\nGLOBAL key = "missing"\nGLOBAL result\nWHEN flag clicked:\n  set result to (arcade animation ${operation} resource (key))\n  arcade log (compare value (result) op "===" with (undefined value))\n`);
    assert.deepEqual(creator.warnings, []);
    const exported = projectToArcade(creator.project, {animationDocuments: [sourceDocument()]});
    assert.deepEqual(exported.unsupported, []);
    const compiled = await compile('arcade', exported.files);
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    const run = await runArcadeSim(compiled.outfiles['binary.js'], {ms: 100});
    assert.equal(run.error, null);
    assert.ok(run.serial.some(entry => String(entry.text).includes('Animation resource unavailable: missing')));
    assert.ok(run.serial.some(entry => String(entry.text).includes('true')));
  }
});


test('animation helper names avoid saved variables first referenced after the resource', async () => {
    const creator = new Creator();
    creator.parse(program(`"${id}"`).replace('GLOBAL actor', 'GLOBAL __bwAnimationFrames0 = 42\nGLOBAL __bwAnimationFrames = "saved"\nGLOBAL __bwAnimationInterval = 17\nGLOBAL __bwAnimationFreshFrames = 23\nGLOBAL actor') +
        '  arcade log (__bwAnimationFrames0)\n  arcade log (__bwAnimationFrames)\n  arcade log (__bwAnimationInterval)\n  arcade log (__bwAnimationFreshFrames)\n');
    assert.deepEqual(creator.warnings, []);
    const exported = projectToArcade(creator.project, {animationDocuments: [sourceDocument()]});
    assert.deepEqual(exported.unsupported, []);
    assert.match(exported.ts, /let __bwAnimationFrames0_: Image\[\]/);
    assert.match(exported.ts, /function __bwAnimationFrames_ \(id: string\)/);
    assert.match(exported.ts, /function __bwAnimationInterval_ \(id: string\)/);
    assert.match(exported.ts, /function __bwAnimationFreshFrames_ \(id: string\)/);
    const compiled = await compile('arcade', exported.files);
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    const run = await runArcadeSim(compiled.outfiles['binary.js'], {ms: 75});
    assert.equal(run.error, null);
    for (const value of ['42', 'saved', '17', '23']) assert.ok(run.serial.some(entry => String(entry.text).includes(value)), value);
});


test('single-frame and endpoint native durations export as real assets and compile in original PXT', async () => {
    const creator = new Creator(); creator.parse(program(`"${id}"`));
    for (const count of [1, 2]) for (const intervalMs of [1, 65535]) {
        const document = sourceDocument(); document.version = 5;
        document.animation.frames = document.animation.frames.slice(0, count);
        document.animation.frames.forEach(frame => { frame.durationMs = intervalMs; });
        const exported = projectToArcade(creator.project, {animationDocuments: [document]});
        assert.deepEqual(exported.unsupported, []);
        assert.deepEqual(exported.warnings, []);
        const jres = JSON.parse(exported.files['images.g.jres']);
        const animations = Object.entries(jres).filter(([, value]) => value.mimeType === 'application/mkcd-animation')
            .map(([key, value]) => decodeAnimationJres(value, key, jres['*']?.namespace));
        assert.equal(animations.length, 1);
        assert.equal(animations[0].intervalMs, intervalMs);
        assert.equal(animations[0].frames.length, count);
        const restored = recoverAnimationCompanion(exported.files[ANIMATION_COMPANION_PATH], animations);
        assert.deepEqual(restored.warnings, []);
        assert.deepEqual(restored.resources[0].document, document);
        const compiled = await compile('arcade', exported.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
        const run = await runArcadeSim(compiled.outfiles['binary.js'], {ms: 75});
        assert.equal(run.error, null);
        assert.ok(run.screen()[59 * 160 + 79]);
        assert.ok(run.serial.some(entry => String(entry.text).includes('true')));
        const imported = arcadeToPseudocode(exported.files);
        assert.deepEqual(imported.unsupported, []);
        assert.deepEqual(imported.animationResources[0].document, document);
    }
});

test('fresh resource export preserves native factory allocation and isolates array/image mutations in original PXT', async () => {
    for (const resource of [`"${id}"`, '(key)']) {
        const source = `DEVICE ARCADE
GLOBAL key = "${id}"
GLOBAL shared
GLOBAL first
GLOBAL second
GLOBAL third
GLOBAL discarded
WHEN flag clicked:
  set shared to arcade animation frames resource ${resource}
  set first to arcade animation fresh frames resource ${resource}
  set second to arcade animation fresh frames resource ${resource}
  arcade log (compare value (first) op "===" with (second))
  arcade log (compare value (item 0 of array reference (first)) op "===" with (item 0 of array reference (second)))
  arcade set image pixel (item 0 of array reference (first)) x 0 y 0 color 7
  arcade log (arcade image pixel (item 0 of array reference (second)) x 0 y 0)
  arcade log (arcade image pixel (item 0 of array reference (shared)) x 0 y 0)
  arcade set image pixel (item 0 of array reference (shared)) x 0 y 0 color 9
  set third to arcade animation fresh frames resource ${resource}
  arcade log (arcade image pixel (item 0 of array reference (third)) x 0 y 0)
  arcade log (compare value (shared) op "===" with (arcade animation frames resource ${resource}))
  set discarded to (pop from array reference (first) index 0)
  arcade log (length of array reference (first))
  arcade log (length of array reference (second))
`;
        const creator = new Creator(); creator.parse(source);
        assert.deepEqual(creator.warnings, []);
        const output = projectToArcade(creator.project, {animationDocuments: [sourceDocument()]});
        assert.deepEqual(output.unsupported, []); assert.deepEqual(output.warnings, []);
        assert.match(output.ts, /let first: Image\[\]/);
        assert.match(output.ts, /function __bwAnimationFreshFrames.*\n.*return assets\.animation`/);
        const compiled = await compile('arcade', output.files);
        assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
        const executed = await runArcadeSim(compiled.outfiles['binary.js'], {ms: 100});
        assert.equal(executed.error, null);
        assert.deepEqual(executed.serial.map(row => String(row.text).trim()), ['false','false','2','2','2','true','1','2']);
        // A complete BW → native → BW → native permutation must retain the
        // allocation distinction, even before editable library restoration.
        const imported = arcadeToPseudocode(output.files);
        assert.deepEqual(imported.unsupported, []);
        const roundtrip = new Creator(); roundtrip.parse(imported.code);
        assert.deepEqual(roundtrip.warnings, []);
        for (const costume of imported.costumes) {
            const applied = costume.mode === 'add' ?
                roundtrip.addCustomSVGCostume(costume.sprite, costume.svg, costume.name) :
                roundtrip.applyCustomSVG(costume.sprite, costume.svg);
            assert.equal(applied, true, `attach imported artwork: ${costume.sprite}`);
        }
        const returned = projectToArcade(roundtrip.project, {
            costumeSvg: (_target, costume) => roundtrip.assets.get(costume.assetId)?.data || null
        });
        assert.deepEqual(returned.unsupported, []);
        const rebuilt = await compile('arcade', returned.files);
        assert.equal(rebuilt.success, true, JSON.stringify(rebuilt.diagnostics));
        const rerun = await runArcadeSim(rebuilt.outfiles['binary.js'], {ms: 100});
        assert.equal(rerun.error, null);
        assert.deepEqual(rerun.serial.map(row => String(row.text).trim()), ['false','false','2','2','2','true','1','2']);
    }
});
