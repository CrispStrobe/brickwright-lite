#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium, webkit} from 'playwright';

const source = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-arcade-device-frame.js', import.meta.url), 'utf8');
const engines = process.env.BW_FRAME_ENGINES ? process.env.BW_FRAME_ENGINES.split(',') : ['chromium'];
for (const engine of engines) {
const browser = await (engine === 'webkit' ? webkit : chromium).launch(process.env.BW_BROWSER && engine === 'chromium' ? {executablePath: process.env.BW_BROWSER} : {});
try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const observations = await page.evaluate(async moduleSource => {
        const {paintArcadeDeviceFrame} = await import(`data:text/javascript;base64,${btoa(moduleSource)}`);
        const destination = document.createElement('canvas');
        destination.width = 160;
        destination.height = 128;
        const source = document.createElement('canvas');
        source.width = 160;
        source.height = 120;
        const color = () => Array.from(destination.getContext('2d').getImageData(80, 64, 1, 1).data);
        const fill = value => {
            source.getContext('2d').fillStyle = value;
            source.getContext('2d').fillRect(0, 0, source.width, source.height);
        };
        fill('#ff0000');
        paintArcadeDeviceFrame(destination, source);
        const first = color();
        source.width = 0;
        paintArcadeDeviceFrame(destination, source);
        const widthUnavailable = color();
        source.width = 160;
        source.height = 0;
        paintArcadeDeviceFrame(destination, source);
        const heightUnavailable = color();
        paintArcadeDeviceFrame(destination, null);
        const detached = color();
        source.height = 120;
        fill('#00ff00');
        // Same destination and painter, as with the pane's uninterrupted RAF loop.
        paintArcadeDeviceFrame(destination, source);
        const restored = color();
        paintArcadeDeviceFrame(null, source);
        paintArcadeDeviceFrame({getContext: () => null}, source);
        return {first, widthUnavailable, heightUnavailable, detached, restored};
    }, source);
    assert.deepEqual(observations.first, [255, 0, 0, 255]);
    for (const key of ['widthUnavailable', 'heightUnavailable', 'detached']) {
        assert.deepEqual(observations[key], [2, 6, 23, 255], key);
    }
    assert.deepEqual(observations.restored, [0, 255, 0, 255]);
    assert.deepEqual(errors, []);
    console.log(`Arcade display (${engine}): zero-width, zero-height and detached stage clear; restored stage draws again`);
    // Flicker: a real WebGL canvas like the renderer's (no preserveDrawingBuffer, drawn from a
    // timer at 30 Hz while the display runs at its own rate). WebKit clears such a buffer once
    // composited, so an independent per-display-frame copy shows black frames; the pane's
    // draw-synchronous mirror must show none.
    const flicker = await page.evaluate(async moduleSource => {
        const {mirrorArcadeDeviceFrame, paintArcadeDeviceFrame} = await import(`data:text/javascript;base64,${btoa(moduleSource)}`);
        const measure = async mirrored => {
            const stage = document.createElement('canvas');
            stage.width = 480;
            stage.height = 360;
            const gl = stage.getContext('webgl', {alpha: false, antialias: false});
            const renderer = {canvas: stage, draw () {
                gl.clearColor(1, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }};
            const destination = document.createElement('canvas');
            destination.width = 160;
            destination.height = 128;
            document.body.append(stage, destination);
            const timer = setInterval(() => renderer.draw(), 33);
            const release = mirrored ? mirrorArcadeDeviceFrame(renderer, () => destination) : () => {};
            let frames = 0;
            let blank = 0;
            await new Promise(resolve => {
                const stop = performance.now() + 2500;
                const tick = now => {
                    if (!mirrored) paintArcadeDeviceFrame(destination, stage);
                    const [r, g, b] = destination.getContext('2d').getImageData(80, 64, 1, 1).data;
                    frames++;
                    if (!(r > 200 && g < 50 && b < 50)) blank++;
                    if (now < stop) requestAnimationFrame(tick); else resolve();
                };
                requestAnimationFrame(tick);
            });
            clearInterval(timer);
            release();
            return {frames, blank};
        };
        return {mirrored: await measure(true), independent: await measure(false)};
    }, source);
    assert.ok(flicker.mirrored.frames > 30, `${engine} sampled ${flicker.mirrored.frames} frames`);
    assert.equal(flicker.mirrored.blank, 0, `${engine}: console shows a cleared frame (${JSON.stringify(flicker)})`);
    console.log(`Arcade display (${engine}) flicker: mirrored ${JSON.stringify(flicker.mirrored)}; independent copy ${JSON.stringify(flicker.independent)}`);
} finally {
    await browser.close();
}
}
