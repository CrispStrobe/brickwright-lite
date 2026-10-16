import test from 'node:test';
import assert from 'node:assert/strict';
import {inferTarget, importProjectFiles, importArtefact, makeCodeProjectFile} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';

test('CPX projects select their target before the shared input.onGesture vocabulary', () => {
    const files = {'main.ts': 'input.onGesture(Gesture.Shake, function () { light.setAll(0xff0000) })'};
    assert.equal(inferTarget(files), 'adafruit');
    assert.equal(inferTarget(files, 'https://makecode.adafruit.com/'), 'adafruit');
    assert.equal(inferTarget({}, 'adafruit'), 'adafruit');
});

test('CPX source markers select adafruit without taking other targets', () => {
    for (const source of [
        'light.clear()', 'input.buttonA.isPressed()', 'input.buttonB.onEvent(ButtonEvent.Click, function () {})',
        'input.switchRight()', 'pins.digitalWritePin(CPlayPinName.A1, true)',
        'music.magicWand.play()', 'music.baDing.play()', 'music.siren.play()'
    ]) assert.equal(inferTarget({'main.ts': source}), 'adafruit', source);
    for (const [source, target] of [
        ['basic.showNumber(1)', 'microbit'],
        ['input.onGesture(Gesture.Shake, function () { basic.showNumber(1) })', 'microbit'],
        ['motors.largeA.run(50)', 'ev3'], ['sprites.create(img`1`)', 'arcade']
    ]) assert.equal(inferTarget({'main.ts': source}), target, source);
    assert.equal(inferTarget({'main.ts': 'light.clear()'}, 'https://arcade.makecode.com/'), 'arcade');
    assert.equal(inferTarget({'main.ts': 'light.clear()'}, 'https://makecode.microbit.org/'), 'microbit');
    assert.equal(inferTarget({'main.ts': 'light.clear()'}, 'https://makecode.calliope.cc/'), 'calliopemini');
});

test('CPX recovered source becomes DEVICE CPX while retaining its source and target', () => {
    const files = {'main.ts': 'light.setAll(0xff0000)'};
    const imported = importProjectFiles(files, {target: 'adafruit', name: 'ring'});
    assert.equal(imported.lang, 'pseudocode');
    assert.match(imported.code, /^DEVICE CPX\n/);
    assert.equal(imported.project.target, 'adafruit');
    assert.equal(imported.source, files['main.ts']);
    assert.equal(imported.files, files);
    assert.deepEqual(imported.unsupported, []);
});

test('CPX vocabulary inside comments and literal text cannot retarget a micro:bit program', () => {
    assert.equal(inferTarget({'main.ts': 'basic.showString("light.setAll(0)")'}), 'microbit');
    assert.equal(inferTarget({'main.ts': '// input.buttonA.isPressed()\nbasic.showNumber(1)'}), 'microbit');
    assert.equal(inferTarget({'main.ts': 'basic.showString(`input.switchRight()`)'}), 'microbit');
});

test('an unknown file target can recover CPX from its own vocabulary', () => {
    const r = importProjectFiles({'main.ts': 'light.setAll(0xff0000)'}, {target: 'unknown'});
    assert.equal(r.project.target, 'adafruit');
    assert.match(r.code, /^DEVICE CPX/);
});

test('CPX Python source is refused by name while its original files remain available', () => {
    const files = {'main.py': 'light.set_all(0xff0000)'};
    const r = importProjectFiles(files, {target: 'adafruit'});
    assert.equal(r.lang, 'pseudocode');
    assert.match(r.code, /^DEVICE CPX/);
    assert.ok(r.unsupported.some(s => /main\.py.*Python.*not implemented/.test(s)));
    assert.equal(r.files, files);
    assert.equal(r.source, files['main.py']);
});

test('a source-only CPX project file traverses the actual artefact importer', async () => {
    const files = {'main.ts': 'light.setAll(0xff0000)', 'pxt.json': JSON.stringify({
        name: 'ring', dependencies: {'circuit-playground': '*'}, files: ['main.ts']})};
    const bytes = Buffer.from(makeCodeProjectFile(files, {name: 'ring', target: 'adafruit'}));
    const r = await importArtefact(bytes, {name: 'ring.mkcd'});
    assert.equal(r.project.target, 'adafruit');
    assert.equal(r.lang, 'pseudocode');
    assert.match(r.code, /^DEVICE CPX/);
    assert.deepEqual(r.unsupported, []);
});
