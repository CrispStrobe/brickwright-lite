import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {animationResourceFromDocument} from '../overlay/scratch-gui/src/lib/bw-animation-resources.js';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';

const layer = (pixels, opacity = 1) => ({type: 'pixel', visible: true, opacity,
    content: {kind: 'pixels', value: {width: 2, height: 1, pixels}}});
const document = () => ({version: 4, animation: {resource: {id: 'timeline-1', name: 'Walk'}, frames: [
    {id: 'first', durationMs: 100, layers: [layer([2, 0])]},
    {id: 'second', durationMs: 100, layers: [layer([3, 4])]}
]}});

test('animation source keeps frame order, pixels and identity independently of display name', () => {
    const source = document(), result = animationResourceFromDocument(source);
    assert.deepEqual(result.frames.map(frame => [...frame.pixels]), [[2, 0], [3, 4]]);
    source.animation.resource.name = 'Renamed';
    assert.equal(animationResourceFromDocument(source).revision, result.revision);
    source.animation.frames.reverse();
    assert.notEqual(animationResourceFromDocument(source).revision, result.revision);
    assert.deepEqual(result.warnings, []);
});

test('animation composition blends visible layers before palette quantization', () => {
    const source = document();
    source.palette = [...ARCADE_PALETTE];
    source.palette[2] = '#ff0000'; source.palette[3] = '#0000ff'; source.palette[4] = '#800080';
    source.animation.frames[0].layers = [layer([2, 2]), layer([3, 0], 0.5)];
    const result = animationResourceFromDocument(source);
    assert.deepEqual([...result.frames[0].pixels], [4, 2]);
    assert.deepEqual(result.warnings, []);
    source.animation.frames[1].layers = [layer([3, 0], 0.4)];
    const faded = animationResourceFromDocument(source);
    assert.deepEqual([...faded.frames[1].pixels], [0, 0]);
    assert.ok(faded.warnings.some(message => message.includes('partial opacity')));
});

test('bad identities, unequal timing and mismatched pixels are named refusals', () => {
    const source = document(); source.animation.frames[1].durationMs = 200;
    assert.throws(() => animationResourceFromDocument(source), /equal frame durations/);
    source.animation.frames[1].durationMs = 100;
    source.animation.frames[1].id = 'first';
    assert.throws(() => animationResourceFromDocument(source), /duplicate frame IDs/);
    source.animation.frames[1].id = 'second';
    source.animation.frames[1].layers[0].content.value.pixels = [16, 0];
    assert.throws(() => animationResourceFromDocument(source), /invalid pixel layers/);
    source.animation.resource.id = 'bad id';
    assert.throws(() => animationResourceFromDocument(source), /stable ID/);
});

test('runtime SVG uses a resource palette without changing ordinary image defaults', () => {
    const require = createRequire(import.meta.url);
    const engine = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image.js')(ARCADE_PALETTE, () => ({}));
    const image = {width: 1, height: 1, pixels: Uint8Array.of(2)};
    assert.match(engine.svg(image), new RegExp(ARCADE_PALETTE[2]));
    image.palette = [...ARCADE_PALETTE]; image.palette[2] = '#123456';
    assert.match(engine.svg(image), /#123456/);
    assert.match(engine.svg(image, ARCADE_PALETTE), new RegExp(ARCADE_PALETTE[2]));
});

test('native resource source accepts versioned endpoint timing and refuses out-of-range values', () => {
    const source = document(); source.version = 5; source.animation.frames.length = 1;
    for (const interval of [1, 65535]) {
        source.animation.frames[0].durationMs = interval;
        assert.equal(animationResourceFromDocument(source).frames[0].durationMs, interval);
    }
    for (const interval of [0, -1, 1.5, 65536, NaN]) {
        source.animation.frames[0].durationMs = interval;
        assert.throws(() => animationResourceFromDocument(source), /equal frame durations/);
    }
    source.animation.frames = [];
    assert.throws(() => animationResourceFromDocument(source), /requires 1–64 frames/);
});
