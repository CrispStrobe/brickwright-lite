// A painter projection of the existing startup-palette inspector. This never
// rewrites tile indices or selects colors from mutable runtime image values.
import {inspectProjectPalette} from '../arcade-project-palette.js';

export function inspectTilemapPalette (vm) {
    const project = inspectProjectPalette(vm);
    const resolved = project.kind === 'default' || project.kind === 'constant';
    return {kind: project.kind, signature: project.signature, laterChanges: project.laterChanges,
        colors: resolved ? [null, ...project.colors.slice(1)] : null};
}

export const tilemapPixelColor = (palette, index) => index === 0 ? null :
    palette.colors ? palette.colors[index] : '#94a3b8';

/** Paint indexed artwork directly; equal RGB values never merge its indices. */
export function drawTilemapImage (ctx, image, x, y, scale, palette) {
    for (let py = 0; py < image.height; py++) {
        for (let px = 0; px < image.width; px++) {
            const color = tilemapPixelColor(palette, image.pixels[py * image.width + px]);
            if (color === null) continue;
            ctx.fillStyle = color;
            ctx.fillRect(x + px * scale, y + py * scale, scale, scale);
        }
    }
}

/** Observe actual project edits/load; release also fences already queued callbacks. */
export function observeTilemapPalette (vm, changed) {
    let active = true, pending = false;
    const deliver = () => {
        if (!active) return;
        let palette;
        try { palette = inspectTilemapPalette(vm); }
        catch (error) {
            // A persistent malformed project is an unavailable preview, with
            // its actual error retained. The direct inspector stays strict.
            palette = {kind: 'unavailable', signature: null, laterChanges: false, colors: null, error,
                errorMessage: String(error?.message || error)};
        }
        changed(palette);
    };
    const refresh = () => {
        if (!active || pending) return;
        pending = true;
        // Blocks emits PROJECT_CHANGED while recursively deleting children.
        // Reading startup chains synchronously can throw into that mutator and
        // leave its parent pointing at a deleted child. Observe the completed
        // synchronous batch, coalescing its edit/load notifications.
        queueMicrotask(() => { pending = false; deliver(); });
    };
    const subscriptions = [[vm.runtime, 'PROJECT_CHANGED'], [vm, 'PROJECT_LOADED'], [vm, 'targetsUpdate']];
    for (const [source, event] of subscriptions) source.on(event, refresh);
    deliver();
    return () => {
        active = false;
        for (const [source, event] of subscriptions) source.removeListener(event, refresh);
    };
}
