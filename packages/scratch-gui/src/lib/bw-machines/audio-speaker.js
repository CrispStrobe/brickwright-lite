// Machine Manager — audio speaker (design §4.5, the audio counterpart of
// video-mirror.js / keyboard-steer.js).
//
// Play a running machine's `audio()` through the browser's speakers. Every CPU's
// audio face is the same shape — an ARRAY of voices `[{hz, on}, …]` (the ZX
// beeper, the PC speaker via the 8254, a PSG), silent when a voice is `on:false`
// or `hz:0` — so one Web Audio bridge covers them all: one square oscillator per
// voice, its frequency tracking `hz`, its gain gated by `on`. A machine's sound
// reaches the user the way its screen does. Debug stays an instrument; this is
// the "attached speakers where brickwright-lite runs" the user asked for.
//
// The AudioContext is injectable, so the pure per-frame logic (which voice plays
// what) is driven by a fake context in a Node test with no browser audio.

const DEFAULT_GAIN = 0.08; // a square beeper at full gain is harsh; keep it gentle.

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
 * Create a speaker that polls `audioFn()` and drives Web Audio per voice.
 * Returns `{start, stop, tick, running, voiceCount}`. `tick` runs one poll (the
 * unit a Node test drives). A browser starts audio on a user gesture — call
 * `start()` from the Run/boot click.
 *
 * @param {object} opts
 * @param {() => (Array<{hz:number, on:boolean}>|null)} opts.audioFn  the machine's `audio()`
 * @param {AudioContext} [opts.ctx]  an AudioContext (default: a new one); tests inject a fake
 * @param {number} [opts.gain=0.08]  per-voice gain when on
 * @param {(cb:Function)=>any} [opts.schedule]
 * @param {(h:any)=>void} [opts.cancel]
 */
export function createMachineAudioSpeaker(opts = {}) {
    const audioFn = opts.audioFn;
    const gain = typeof opts.gain === 'number' ? opts.gain : DEFAULT_GAIN;
    const schedule = typeof opts.schedule === 'function' ? opts.schedule : defaultSchedule;
    const cancel = typeof opts.cancel === 'function' ? opts.cancel : defaultCancel;
    const makeCtx = () => {
        if (opts.ctx) return opts.ctx;
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        return AC ? new AC() : null;
    };

    let ctx = null;
    const voices = [];   // per index: {osc, gain}
    let running = false;
    let handle = null;

    function ensureCtx() {
        if (!ctx) ctx = makeCtx();
        if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
            try { ctx.resume(); } catch { /* gesture needed; a later tick retries */ }
        }
        return ctx;
    }

    function ensureVoice(i) {
        if (voices[i]) return voices[i];
        const c = ensureCtx();
        if (!c) return null;
        const osc = c.createOscillator();
        osc.type = 'square';                 // beeper / PC speaker are square waves
        const g = c.createGain();
        g.gain.value = 0;
        osc.connect(g); g.connect(c.destination);
        try { osc.start(); } catch { /* already started */ }
        voices[i] = {osc, gain: g};
        return voices[i];
    }

    function tick() {
        if (typeof audioFn !== 'function') return;
        let arr;
        try { arr = audioFn(); } catch { return; }
        if (!Array.isArray(arr)) arr = arr ? [arr] : [];
        // Silence voices the machine no longer reports.
        for (let i = arr.length; i < voices.length; i++) {
            if (voices[i]) voices[i].gain.gain.value = 0;
        }
        for (let i = 0; i < arr.length; i++) {
            const v = arr[i] || {};
            const on = !!v.on && Number(v.hz) > 0;
            const voice = ensureVoice(i);
            if (!voice) continue;
            if (on) {
                voice.osc.frequency.value = Number(v.hz);
                voice.gain.gain.value = gain;
            } else {
                voice.gain.gain.value = 0;
            }
        }
    }

    function loop() {
        if (!running) return;
        tick();
        handle = schedule(loop);
    }

    return {
        get running() { return running; },
        get voiceCount() { return voices.length; },
        tick,
        start() {
            if (running) return;
            ensureCtx();
            running = true;
            handle = schedule(loop);
        },
        stop() {
            running = false;
            if (handle != null) { cancel(handle); handle = null; }
            for (const v of voices) if (v) v.gain.gain.value = 0;
        }
    };
}
