// ---------------------------------------------------------------------------------------------
// Questions to the user that work in the browser AND in the Tauri app (task E6).
//
// tauri-plugin-dialog 2.7.1 injects an init script on every non-Android platform
// (src/lib.rs: `js_init_script(include_str!("init-iife.js"))`, source guest-js/init.ts) that does
//     window.alert   = function (message) { void invoke('plugin:dialog|message', {message}) }
//     window.confirm = async function (message) { return await invoke(<the plugin's confirm>, ...) }
// Tauri has no synchronous IPC, so `confirm` returns a Promise — always truthy — and the
// plugin's `confirm` command it calls is not registered in 2.7.1 (generate_handler! lists
// open, save, message only), so that Promise rejects without showing anything. Every
// `if (confirm(...))` in the app therefore went ahead without asking, on desktop and iOS.
// `window.prompt` is not replaced.
//
// The rule: never use the value of `confirm(...)` directly. Ask through `confirmAsync` and
// await it; `test/native-confirm.test.mjs` holds every call site to that.
// ---------------------------------------------------------------------------------------------

const nativeInvoke = () => {
    const tauri = typeof window !== 'undefined' && window.__TAURI__;
    return tauri && tauri.core && typeof tauri.core.invoke === 'function' ? tauri.core.invoke : null;
};

/**
 * The browser's confirm, read as a strict boolean. A non-boolean answer (a Promise from a
 * replaced `window.confirm`, or anything else) is awaited and must be exactly `true`; a
 * rejection is a No.
 * @param {string} message text to show
 * @param {boolean} unavailable the answer when there is no `confirm` to ask with
 * @returns {Promise<boolean>} the answer
 */
const browserConfirm = async (message, unavailable) => {
    const scope = typeof window !== 'undefined' ? window : globalThis;
    if (!scope || typeof scope.confirm !== 'function') return unavailable;
    try {
        return (await scope.confirm(message)) === true; // eslint-disable-line no-alert
    } catch (error) {
        return false;
    }
};

/**
 * A native message box that the caller can wait for, through `plugin:dialog|message`: the one
 * dialog command the editor's capability grants. Outside the app it is the browser's own box.
 * @param {string} message text to show
 * @param {boolean} [cancellable] show OK and Cancel
 * @returns {Promise<boolean>} true only when the user chose OK
 */
export const nativeMessage = async (message, cancellable = false) => {
    const invoke = nativeInvoke();
    if (!invoke) {
        if (cancellable) return browserConfirm(message, false);
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert(message); // eslint-disable-line no-alert
        }
        return true;
    }
    const answer = await Promise.resolve(invoke('plugin:dialog|message', {
        message: String(message),
        kind: 'warning',
        buttons: cancellable ? 'OkCancel' : 'Ok'
    })).catch(error => {
        // eslint-disable-next-line no-console
        console.error('[brickwright] message dialog failed', message, error);
        return null;
    });
    return answer === 'Ok';
};

/**
 * Ask a yes/no question and WAIT for the answer: a native OK/Cancel box in the Tauri app, the
 * browser's `confirm` elsewhere (still synchronous there, so browser gates that accept or
 * dismiss dialogs keep working).
 * @param {string} message the question
 * @param {{unavailable: (boolean|undefined)}} [options] `unavailable`: the answer when neither
 *     a native dialog nor `confirm` exists (a headless harness); default false, so an action
 *     that needs consent does not happen without it
 * @returns {Promise<boolean>} true only when the user chose OK
 */
export const confirmAsync = (message, {unavailable = false} = {}) => (
    nativeInvoke() ? nativeMessage(message, true) : browserConfirm(message, unavailable)
);

/**
 * `ScratchBlocks.confirm` replacement (Blockly's documented override point; the default calls
 * `callback(window.confirm(message))`, which in the app hands the callback a Promise, and
 * scratch-blocks deletes on any truthy answer: "Delete N blocks?", "Delete the variable used
 * N times?").
 * @param {string} message the question
 * @param {function(boolean)} callback receives the answer
 * @returns {Promise<void>} settles after the callback ran
 */
export const blocklyConfirm = (message, callback) => confirmAsync(message).then(answer => callback(answer));
