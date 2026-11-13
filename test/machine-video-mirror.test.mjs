import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-machines/video-mirror.js', import.meta.url), 'utf8');
const {createMachineVideoMirror} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function fixture(panel, videoFn = () => ({width: 1, height: 1, rgba: new Uint8Array(4), frame: 7})) {
    const callbacks = new Map();
    let next = 0;
    const mirror = createMachineVideoMirror({panel, name: 'vga', videoFn,
        schedule(callback) { callbacks.set(++next, callback); return next; },
        cancel(handle) { callbacks.delete(handle); }});
    return {mirror, callbacks, step() {
        assert.equal(callbacks.size, 1, 'exactly one animation callback stays pending');
        const [handle, callback] = callbacks.entries().next().value;
        callbacks.delete(handle);
        callback();
    }};
}

test('a failed display paint retries the same frame and keeps the animation alive', () => {
    let fail = true;
    const painted = [];
    const {mirror, callbacks, step} = fixture({setVgaFrame(name, frame) {
        if (fail) throw new Error('display temporarily unavailable');
        painted.push([name, frame.frame]);
    }});
    mirror.start();
    step();
    assert.equal(mirror.running, true);
    assert.equal(mirror.frameCount, 0);
    fail = false;
    step();
    assert.deepEqual(painted, [['vga', 7]]);
    assert.equal(mirror.frameCount, 1);
    step();
    assert.equal(painted.length, 1, 'a successfully painted frame is still deduplicated');
    mirror.stop();
    assert.equal(callbacks.size, 0);
});

test('an absent display sink does not consume the frame before the sink is attached', () => {
    const panel = {};
    const {mirror} = fixture(panel);
    assert.equal(mirror.tick(), false);
    assert.equal(mirror.frameCount, 0);
    const painted = [];
    panel.setVgaFrame = (name, frame) => painted.push(frame.frame);
    assert.equal(mirror.tick(), true);
    assert.deepEqual(painted, [7]);
    assert.equal(mirror.frameCount, 1);
});

test('a transient video source failure preserves scheduling and recovers', () => {
    let fail = true;
    let paints = 0;
    const {mirror, step} = fixture({setVgaFrame() { paints++; }}, () => {
        if (fail) throw new Error('runner not ready');
        return {width: 1, height: 1, rgba: new Uint8Array(4)};
    });
    mirror.start();
    step();
    assert.equal(paints, 0);
    fail = false;
    step();
    step();
    assert.equal(paints, 2, 'frames without counters keep painting');
    mirror.stop();
});

test('the installed-package mirror matches the overlay', () => {
    assert.equal(readFileSync(new URL('../packages/scratch-gui/src/lib/bw-machines/video-mirror.js', import.meta.url), 'utf8'), source);
});
