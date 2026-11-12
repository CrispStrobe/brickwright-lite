// Renderer backing dimensions can disappear during stage/project transitions.
// Always clear the display, then copy only a drawable backing canvas. The caller
// keeps scheduling frames so a restored stage appears without remounting the pane.
export const paintArcadeDeviceFrame = (destination, source) => {
    if (!destination) return;
    const context = destination.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#020617';
    context.fillRect(0, 0, destination.width, destination.height);
    if (source && source.width > 0 && source.height > 0) {
        context.drawImage(source, 0, 0, source.width, source.height, 0, 4, 160, 120);
    }
};

// The renderer's WebGL canvas has no preserveDrawingBuffer, so once the browser
// has composited a frame its drawing buffer is cleared. WebKit does that
// strictly (Chromium happens to keep the pixels); copying from an independent
// requestAnimationFrame therefore reads a cleared (black) buffer on every frame
// the renderer did not draw since the last composite, and the console flickers.
// The only moment the buffer is guaranteed complete is synchronously after
// renderer.draw() returns, so the console is painted from there and nowhere
// else: one writer, one complete frame per renderer frame, and no repaint (so
// no clear) in between.
const LISTENERS = Symbol.for('bw.arcade.rendererDrawListeners');

// Calls listener() synchronously after every renderer.draw(). One wrapper per
// renderer however many listeners; returns a release function.
export const onRendererDraw = (renderer, listener) => {
    if (!renderer || typeof renderer.draw !== 'function') return () => {};
    if (!renderer[LISTENERS]) {
        const listeners = new Set();
        const original = renderer.draw;
        const wrapped = function (...args) {
            const result = original.apply(this, args);
            listeners.forEach(each => each());
            return result;
        };
        renderer[LISTENERS] = listeners;
        renderer.draw = wrapped;
        listeners.unwrap = () => {
            if (renderer.draw === wrapped) renderer.draw = original;
            delete renderer[LISTENERS];
        };
    }
    const listeners = renderer[LISTENERS];
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && renderer[LISTENERS] === listeners) listeners.unwrap();
    };
};

// Mirrors renderer frames into the console canvas. getDestination() is read at
// paint time so a remounted canvas is picked up. Returns a release function.
export const mirrorArcadeDeviceFrame = (renderer, getDestination) => {
    if (!renderer) return () => {};
    const release = onRendererDraw(renderer, () => paintArcadeDeviceFrame(getDestination(), renderer.canvas));
    renderer.draw(); // show the current stage immediately, not after the next step
    return release;
};
