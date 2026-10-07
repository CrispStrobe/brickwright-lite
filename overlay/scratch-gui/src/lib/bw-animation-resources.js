import {ARCADE_PALETTE, editablePixelSize, nearestIndex} from './bw-makecode/pixel-image.js';

/** Render a published Pixel timeline into Arcade's indexed image model.
 * Independent of the GUI document cache; callers provide the complete source.
 */
export const animationResourceFromDocument = document => {
    const animation = document?.animation;
    const resource = animation?.resource;
    if (!resource || typeof resource.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(resource.id) ||
        typeof resource.name !== 'string' || !resource.name.trim() || resource.name.length > 80) {
        throw new Error('Animation resource requires a stable ID and a name of 1–80 characters.');
    }
    const minFrames = document.version === 5 ? 1 : 2;
    const minDuration = document.version === 5 ? 1 : 20;
    const maxDuration = document.version === 5 ? 65535 : 10000;
    if (!Array.isArray(animation.frames) || animation.frames.length < minFrames || animation.frames.length > 64) {
        throw new Error(`Animation "${resource.name}" requires ${minFrames}–64 frames.`);
    }
    const interval = animation.frames[0].durationMs;
    if (!Number.isInteger(interval) || interval < minDuration || interval > maxDuration ||
        animation.frames.some(frame => frame.durationMs !== interval)) {
        throw new Error(`Animation "${resource.name}" requires equal frame durations (${minDuration}–${maxDuration} ms).`);
    }
    const palette = document.palette || ARCADE_PALETTE;
    if (!Array.isArray(palette) || palette.length !== 16 || palette[0] !== null ||
        !palette.slice(1).every(colour => /^#[0-9a-f]{6}$/i.test(colour))) {
        throw new Error(`Animation "${resource.name}" has an invalid palette.`);
    }
    const colours = palette.map(colour => colour && colour.slice(1).match(/../g).map(value => parseInt(value, 16)));
    const first = animation.frames[0].layers?.[0]?.content?.value;
    const width = first?.width, height = first?.height;
    if (!editablePixelSize(width, height)) throw new Error(`Animation "${resource.name}" has invalid dimensions.`);
    const warnings = new Set(), ids = new Set();
    const frames = animation.frames.map(frame => {
        if (typeof frame.id !== 'string' || !frame.id || ids.has(frame.id) || !Array.isArray(frame.layers) || !frame.layers.length) {
            throw new Error(`Animation "${resource.name}" has invalid or duplicate frame IDs.`);
        }
        ids.add(frame.id);
        const rgba = new Float64Array(width * height * 4);
        for (const layer of frame.layers) {
            const image = layer?.content?.value;
            if (layer.type !== 'pixel' || layer.content?.kind !== 'pixels' ||
                image?.width !== width || image.height !== height || image.pixels?.length !== width * height ||
                !Array.from(image.pixels).every(pixel => Number.isInteger(pixel) && pixel >= 0 && pixel <= 15) ||
                typeof layer.visible !== 'boolean' || !Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) {
                throw new Error(`Animation "${resource.name}" contains invalid pixel layers.`);
            }
            if (!layer.visible || !layer.opacity) continue;
            for (let i = 0; i < image.pixels.length; i++) {
                const colour = colours[image.pixels[i]];
                if (!colour) continue;
                const k = i * 4, alpha = layer.opacity;
                for (let c = 0; c < 3; c++) rgba[k + c] = colour[c] * alpha + rgba[k + c] * (1 - alpha);
                rgba[k + 3] = alpha + rgba[k + 3] * (1 - alpha);
            }
        }
        const pixels = new Uint8Array(width * height);
        for (let i = 0; i < pixels.length; i++) {
            const k = i * 4, alpha = rgba[k + 3];
            if (!alpha) continue;
            if (alpha < 1) warnings.add('Animation partial opacity quantized to Arcade transparent/opaque pixels.');
            if (alpha < 0.5) continue;
            const rgb = [rgba[k] / alpha, rgba[k + 1] / alpha, rgba[k + 2] / alpha];
            const index = nearestIndex(rgb, palette);
            if (rgb.some((value, c) => Math.abs(value - colours[index][c]) > 0.5)) {
                warnings.add('Animation blended colours quantized to the project palette.');
            }
            pixels[i] = index;
        }
        return {id: frame.id, durationMs: frame.durationMs, pixels};
    });
    return {id: resource.id, name: resource.name, width, height, palette: [...palette], frames,
        revision: JSON.stringify({id: resource.id, palette, width, height,
            frames: frames.map(frame => ({...frame, pixels: Array.from(frame.pixels)}))}), warnings: [...warnings]};
};
