// Machine Manager — video mirror (design §4.2).
//
// Mirror a running machine's `video()` framebuffer into a ControllerPanel
// display widget (a `simplevga` canvas) — the mechanism behind "watch a
// machine's VGA output in the Widgets pane." A machine's screen is a widget,
// exactly as an LED on a wired board is a widget (bw-board controller.js's
// `setVgaFrame` docstring: "Mirror a machine video card frame into a VGA
// widget"), so the panel is the universal output surface and Debug stays a
// developer instrument.
//
// Both ends of the contract already ship in the pinned bw-board:
//   - the source: `target.video()` → `{width, height, rgba, frame?, signal?}`
//     for every CPU (i8086 CGA/VGA, z80 ULA, 6502 videoFrame chip, 386 adapter);
//   - the sink:   `panel.setVgaFrame(name, frame)` paints a simplevga widget.
// This module is only the pump BETWEEN them — the piece lite was missing.
//
// Framework-free: no React, no DOM assumptions beyond an injectable scheduler,
// so the pump's logic is driven by hand in a Node test (the default scheduler
// is requestAnimationFrame in a browser, a setTimeout fallback elsewhere).

const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
const isStr = v => typeof v === 'string' && v.length > 0;

/**
 * Ensure the panel carries the declared display widget, creating it if absent.
 * Idempotent: a second call with the same name is a no-op (the panel keys
 * widgets by name and `addWidget` throws on a clash, which is swallowed).
 *
 * @param {object} panel a bw-board ControllerPanel (getWidget/addWidget)
 * @param {{name: string, type?: string, config?: object, layout?: object}} decl
 * @returns {string|null} the widget name, or null if it could not be placed
 */
export function ensureVideoWidget(panel, decl) {
    if (!panel || !isObj(decl) || !isStr(decl.name)) return null;
    const type = isStr(decl.type) ? decl.type : 'simplevga';
    if (typeof panel.getWidget === 'function' && panel.getWidget(decl.name)) return decl.name;
    if (typeof panel.addWidget === 'function') {
        try {
            panel.addWidget(decl.name, type,
                isObj(decl.config) ? decl.config : {},
                isObj(decl.layout) ? decl.layout : {});
        } catch (e) {
            // A name clash means it is already there (a race with another
            // caller). Any other failure — an unknown widget type — is real.
            if (!/already exists/i.test(String(e && e.message))) throw e;
        }
    }
    return decl.name;
}

function defaultSchedule(cb) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
    return setTimeout(() => cb(Date.now()), 16);
}
function defaultCancel(handle) {
    if (typeof cancelAnimationFrame === 'function') {
        try { cancelAnimationFrame(handle); return; } catch { /* not a rAF handle */ }
    }
    clearTimeout(handle);
}

/**
 * Create a mirror that polls `videoFn()` and paints the panel widget each frame.
 * Returns `{start, stop, tick, name, running, frameCount}`. `start` schedules a
 * loop; `tick` runs one poll→paint (the unit a Node test drives directly).
 *
 * @param {object} opts
 * @param {object} opts.panel   a bw-board ControllerPanel
 * @param {() => (object|null)} opts.videoFn  the machine's `video()` accessor
 * @param {object} [opts.widget]  the widget declaration (name/type/config/layout)
 * @param {string} [opts.name]    widget name, if `widget` is omitted
 * @param {(cb: Function) => any} [opts.schedule]  scheduler (default rAF/timeout)
 * @param {(h: any) => void} [opts.cancel]  canceller matching `schedule`
 */
export function createMachineVideoMirror(opts = {}) {
    const panel = opts.panel;
    const videoFn = opts.videoFn;
    const decl = isObj(opts.widget) ? opts.widget : null;
    const name = (decl && isStr(decl.name)) ? decl.name : (isStr(opts.name) ? opts.name : null);
    const schedule = typeof opts.schedule === 'function' ? opts.schedule : defaultSchedule;
    const cancel = typeof opts.cancel === 'function' ? opts.cancel : defaultCancel;

    let running = false;
    let handle = null;
    let lastFrame = -1;
    let frames = 0;

    function tick() {
        if (!panel || typeof videoFn !== 'function' || !name) return false;
        let frame;
        // A runner torn down mid-loop can throw from video(); a dead frame is
        // not an error, just nothing to paint.
        try { frame = videoFn(); } catch { return false; }
        if (!frame || (frame.rgba == null && frame.width == null)) return false;
        // Repaint only on a new frame when the card numbers them (a still
        // screen renumbers nothing); always paint when it gives no counter.
        if (typeof frame.frame === 'number' && frame.frame === lastFrame) return false;
        if (typeof panel.setVgaFrame === 'function') panel.setVgaFrame(name, frame);
        lastFrame = typeof frame.frame === 'number' ? frame.frame : lastFrame;
        frames += 1;
        return true;
    }

    function loop() {
        if (!running) return;
        tick();
        handle = schedule(loop);
    }

    return {
        get name() { return name; },
        get running() { return running; },
        get frameCount() { return frames; },
        tick,
        start() {
            if (running || !name) return;
            ensureVideoWidget(panel, decl || {name, type: 'simplevga'});
            running = true;
            handle = schedule(loop);
        },
        stop() {
            running = false;
            if (handle != null) { cancel(handle); handle = null; }
        }
    };
}
