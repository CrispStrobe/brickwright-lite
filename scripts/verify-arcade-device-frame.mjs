#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const source = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-arcade-device-frame.js', import.meta.url), 'utf8');
const browser = await chromium.launch(process.env.BW_BROWSER ? {executablePath: process.env.BW_BROWSER} : {});
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
    console.log('Arcade display: zero-width, zero-height and detached stage clear; restored stage draws again');
} finally {
    await browser.close();
}
