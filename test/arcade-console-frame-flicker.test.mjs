import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mirrorArcadeDeviceFrame, onRendererDraw, paintArcadeDeviceFrame} from '../overlay/scratch-gui/src/lib/bw-arcade-device-frame.js';
import {readFileSync} from 'node:fs';

// A WebGL canvas without preserveDrawingBuffer: pixels exist only until the
// browser composites, after which the buffer reads back cleared (WebKit).
const makeRenderer = () => {
    const renderer = {canvas: {width: 480, height: 360, content: 'cleared'}, draws: 0};
    renderer.draw = () => { renderer.draws++; renderer.canvas.content = `frame ${renderer.draws}`; };
    renderer.composite = () => { renderer.canvas.content = 'cleared'; };
    return renderer;
};
const makeConsole = () => {
    let resizes = 0;
    const destination = {
        get width () { return 160; }, set width (value) { resizes++; },
        get height () { return 128; }, set height (value) { resizes++; },
        getContext: () => ({
            fillRect () { destination.pending = 'cleared'; },
            drawImage (source) { destination.pending = source.content; },
            set fillStyle (_) {}, set imageSmoothingEnabled (_) {}
        })
    };
    return {destination, resizes: () => resizes};
};

test('the console shows only complete renderer frames, never a cleared drawing buffer', () => {
    const renderer = makeRenderer();
    const {destination} = makeConsole();
    const visible = [];
    const release = mirrorArcadeDeviceFrame(renderer, () => destination);
    // 60 display frames while the renderer draws on only 2 of every 3 (30 Hz step vs 60 Hz display).
    for (let frame = 0; frame < 60; frame++) {
        if (frame % 3 !== 2) renderer.draw();
        visible.push(destination.pending);
        renderer.composite();
    }
    release();
    assert.equal(visible.filter(content => content === 'cleared').length, 0);
    assert.ok(visible.every(content => /^frame \d+$/.test(content)));
});

test('the old requestAnimationFrame copy is what shows the cleared frames', () => {
    const renderer = makeRenderer();
    const {destination} = makeConsole();
    const visible = [];
    for (let frame = 0; frame < 60; frame++) {
        if (frame % 3 !== 2) renderer.draw();
        paintArcadeDeviceFrame(destination, renderer.canvas); // independent per-display-frame writer
        visible.push(destination.pending);
        renderer.composite();
    }
    assert.ok(visible.includes('cleared'));
});

test('the console canvas is not resized and nothing is painted without a renderer frame', () => {
    const renderer = makeRenderer();
    const view = makeConsole();
    mirrorArcadeDeviceFrame(renderer, () => view.destination);
    for (let frame = 0; frame < 10; frame++) renderer.draw();
    assert.equal(view.resizes(), 0);
    const before = view.destination.pending;
    renderer.composite();
    assert.equal(view.destination.pending, before);
});

test('draw listeners share one wrapper and fully unwrap on release', () => {
    const renderer = makeRenderer();
    const original = renderer.draw;
    const calls = [];
    const first = onRendererDraw(renderer, () => calls.push('a'));
    const wrapped = renderer.draw;
    const second = onRendererDraw(renderer, () => calls.push('b'));
    assert.equal(renderer.draw, wrapped);
    renderer.draw();
    assert.deepEqual(calls, ['a', 'b']);
    first();
    renderer.draw();
    assert.deepEqual(calls, ['a', 'b', 'b']);
    second();
    assert.equal(renderer.draw, original);
    assert.equal(onRendererDraw(null, () => {}) instanceof Function, true);
});

test('the pane paints the console from renderer.draw only', () => {
    const source = readFileSync('overlay/scratch-gui/src/components/tw-pseudocode/arcade-device-pane.jsx', 'utf8');
    assert.doesNotMatch(source, /paintArcadeDeviceFrame\(destination/);
    assert.doesNotMatch(source, /requestAnimationFrame\(paint\)/);
    assert.match(source, /mirrorArcadeDeviceFrame/);
});
