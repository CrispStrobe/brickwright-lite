import assert from 'node:assert/strict';

// Observe the last production Stage presentation. The scratch copy is never
// fed back to the VM/renderer; no draw, primitive, clock or thread is invoked.
export async function waitForArcadeStageFrame(page, expected, {timeout = 10000} = {}) {
    assert.equal(expected.length, 160 * 120, 'Original screen must contain the full Arcade frame');
    const frame = await page.waitForFunction(expected => {
        const renderer = window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime?.renderer;
        if (!renderer?.canvas?.width || !renderer.canvas.height) return false;
        const canvas = document.createElement('canvas');
        canvas.width = renderer.canvas.width; canvas.height = renderer.canvas.height;
        const context = canvas.getContext('2d'); context.drawImage(renderer.canvas, 0, 0);
        const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const pixels = [];
        for (let y = 0; y < 120; y++) for (let x = 0; x < 160; x++) {
            const offset = (Math.floor((y + .5) * canvas.height / 120) * canvas.width +
                Math.floor((x + .5) * canvas.width / 160)) * 4;
            pixels.push((rgba[offset] + (rgba[offset + 1] << 8) + (rgba[offset + 2] << 16) + 0xff000000) >>> 0);
        }
        return pixels.every((pixel, index) => pixel === expected[index]) ? pixels : false;
    }, Array.from(expected), {polling: 'raf', timeout});
    try { return await frame.jsonValue(); }
    finally { await frame.dispose(); }
}
