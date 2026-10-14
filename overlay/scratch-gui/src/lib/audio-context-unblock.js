/**
 * Firefox will not finish decoding audio while its AudioContext is suspended,
 * and an autoplay-blocked context starts suspended. `decodeAudioData` then
 * neither resolves NOR rejects — it simply never settles.
 *
 * That is fatal rather than cosmetic, because loading a project awaits its
 * sounds: the default project's two sounds never decode, `vm.loadProject`
 * never resolves, and the app sits on "Loading Project …" forever. Measured
 * on the deployed site 2026-08-28: Chromium resolved both decodes and reached
 * SHOWING_WITHOUT_ID; Firefox reached LOADING_VM_NEW_DEFAULT and stopped, with
 * no error, no rejection, and nothing in the console but the autoplay warning.
 * `verify-gui` runs Chromium, which is why CI never saw it.
 *
 * Two defences, because either alone is wrong:
 *
 *  1. Resume the context, now and again on the first real user gesture. This
 *     is the fix that keeps the SOUND — a decode that runs on a running
 *     context produces a real buffer.
 *  2. Bound the decode. A decode that never settles must become a rejection,
 *     because scratch-audio already handles rejection well (it retries as
 *     ADPCM, then falls back to `_emptySound()`), whereas it has no answer at
 *     all for a promise that hangs. Silence beats a dead editor.
 *
 * @module
 */

/** How long a single decode may hang before we call it a failure. Generous:
 *  this is a deadlock detector, not a performance budget, and a slow decode on
 *  a slow machine must not lose its sound. */
export const DECODE_TIMEOUT_MS = 5000;

const GESTURES = ['pointerdown', 'keydown', 'touchstart'];

/**
 * Keep trying to get `context` out of the suspended state.
 * @param {AudioContext} context - the engine's context.
 * @returns {function} unsubscribe, for tests and teardown.
 */
export function resumeOnGesture (context) {
    if (!context || typeof context.resume !== 'function') return () => {};

    const tryResume = () => {
        // Older implementations return undefined rather than a promise.
        try {
            const r = context.resume();
            if (r && typeof r.catch === 'function') r.catch(() => {});
        } catch (e) {
            // A context that refuses to resume is exactly the case defence 2
            // exists for; never let it throw into the caller's constructor.
        }
    };

    // Chromium and (empirically) Firefox both allow a gestureless resume; when
    // a browser does not, the listeners below are the fallback.
    if (context.state === 'suspended') tryResume();

    const onGesture = () => {
        tryResume();
        remove();
    };
    const remove = () => {
        if (typeof document === 'undefined') return;
        for (const type of GESTURES) document.removeEventListener(type, onGesture, true);
    };
    if (typeof document !== 'undefined') {
        for (const type of GESTURES) {
            document.addEventListener(type, onGesture, {capture: true, once: true});
        }
    }
    return remove;
}

/**
 * Replace `context.decodeAudioData` with one that cannot hang forever.
 *
 * The single declared parameter is load-bearing: scratch-audio's AudioEngine
 * chooses between the promise form and the callback form by reading
 * `audioContext.decodeAudioData.length`, so a wrapper declared `(buffer, ok,
 * fail)` would be handed callbacks and this wrapper would never see them.
 *
 * @param {AudioContext} context - the engine's context.
 * @param {number} [timeoutMs] - deadlock threshold.
 * @returns {AudioContext} the same context, for chaining.
 */
export function boundDecodeAudioData (context, timeoutMs = DECODE_TIMEOUT_MS) {
    if (!context || typeof context.decodeAudioData !== 'function') return context;
    if (context.decodeAudioData.__bwBounded) return context;

    const original = context.decodeAudioData.bind(context);
    const wrapped = function (buffer) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error(
                    `decodeAudioData did not settle within ${timeoutMs}ms — the audio ` +
                    'context is probably suspended (autoplay blocking)'));
            }, timeoutMs);

            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                fn(value);
            };

            let result;
            try {
                // Pass callbacks too: an implementation that only supports the
                // callback form ignores the return value, and one that supports
                // both resolves the promise as well. Either way `finish` guards
                // against a double settle.
                result = original(buffer, b => finish(resolve, b), e => finish(reject, e));
            } catch (e) {
                finish(reject, e);
                return;
            }
            if (result && typeof result.then === 'function') {
                result.then(b => finish(resolve, b), e => finish(reject, e));
            }
        });
    };
    wrapped.__bwBounded = true;
    context.decodeAudioData = wrapped;
    return context;
}

/**
 * Both defences, applied to a freshly constructed AudioEngine.
 * @param {object} audioEngine - a scratch-audio AudioEngine.
 * @returns {object} the same engine, for chaining.
 */
export default function unblockAudio (audioEngine) {
    const context = audioEngine && audioEngine.audioContext;
    if (!context) return audioEngine;
    resumeOnGesture(context);
    boundDecodeAudioData(context);
    return audioEngine;
}
