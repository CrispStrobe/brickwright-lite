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

// ---------------------------------------------------------------------------------------------
// Text input (task E8).
//
// `window.prompt` is not replaced by tauri-plugin-dialog 2.7.1, so in the app it is the
// webview's own, and on macOS and iOS that is nothing: the one WKUIDelegate wry 0.55.1 installs
// on both (src/wkwebview/mod.rs:599-602, WryWebViewUIDelegate in
// src/wkwebview/class/wry_web_view_ui_delegate.rs:97-261) implements the file-open panel (macOS
// only), media capture and new-window methods, and not
// webView:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:.
// WKWebView without that method behaves as if the user chose Cancel: every `prompt()` returns
// null at once. WebKitGTK (Linux) and WebView2 (Windows) show their default dialogs (wry
// connects no `script-dialog` handler and never calls SetAreDefaultScriptDialogsEnabled), and
// Android's RustWebChromeClient.kt:196 implements onJsPrompt (without the default text). In the app the question is therefore asked by an in-app modal on every
// platform — one behaviour, testable on the Linux e2e runner — and by `prompt` in a browser.
//
// The rule: never call `prompt(...)` directly. Ask through `promptAsync` and await it;
// `test/native-prompt.test.mjs` holds every call site to that.
// ---------------------------------------------------------------------------------------------

/**
 * The browser's prompt, read as a string or null. A non-string answer (a Promise from a replaced
 * `window.prompt` is awaited first) is a Cancel; so is a missing `prompt` or one that throws.
 * @param {string} message text to show
 * @param {string} defaultValue the pre-filled answer
 * @returns {Promise<?string>} the answer, or null on Cancel
 */
const browserPrompt = async (message, defaultValue) => {
    const scope = typeof window !== 'undefined' ? window : globalThis;
    if (!scope || typeof scope.prompt !== 'function') return null;
    try {
        const answer = await scope.prompt(message, defaultValue); // eslint-disable-line no-alert
        return typeof answer === 'string' ? answer : null;
    } catch (error) {
        return null;
    }
};

// The modal's code is loaded on first use (it is React and only the app needs it).
const loadPromptModal = () => import(/* webpackChunkName: "prompt-modal" */ './prompt-modal.jsx')
    .then(module => module.showPromptModal);

/**
 * True where `prompt` cannot be relied on and `promptAsync` shows the in-app modal instead.
 * @returns {boolean} whether this is the Tauri app
 */
export const usesPromptModal = () => !!nativeInvoke();

/**
 * Ask for a line of text and WAIT for the answer: an in-app modal in the Tauri app (OK = the
 * text, Cancel/Esc = null), the browser's `prompt` elsewhere (still synchronous there, so browser
 * gates that accept or dismiss dialogs keep working).
 * @param {string} message the question
 * @param {string} [defaultValue] the pre-filled answer
 * @returns {Promise<?string>} the text the user confirmed (possibly ''), or null on Cancel
 */
export const promptAsync = async (message, defaultValue = '') => {
    const text = String(message === null || typeof message === 'undefined' ? '' : message);
    const initial = defaultValue === null || typeof defaultValue === 'undefined' ? '' : String(defaultValue);
    if (!usesPromptModal()) return browserPrompt(text, initial);
    try {
        const show = await loadPromptModal();
        const answer = await show({message: text, defaultValue: initial});
        return typeof answer === 'string' ? answer : null;
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[brickwright] text input dialog failed', text, error);
        return null;
    }
};
