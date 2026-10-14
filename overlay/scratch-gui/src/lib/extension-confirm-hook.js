/**
 * Give the bundled CrispStrobe extensions a yes/no question they can wait for (task E7).
 *
 * In the desktop/iOS app `window.confirm` returns a Promise (tauri-plugin-dialog 2.7.1, see
 * lib/native-dialog.js), which is always truthy, so an extension's `if (confirm(...))` went
 * ahead without asking. The extensions (CrispStrobe/extensions #33) ask through
 * `Scratch.BWConfirm` when the host offers it; Lite's adapter
 * (scratch-vm/src/extensions/crispstrobe/adapter.js) offers it whenever
 * `runtime.confirmAsync` is a function, and this installs that: E6's `confirmAsync`, a native
 * OK/Cancel box in the app and the browser's confirm on the web, true only on OK.
 *
 * Idempotent, and it does not overwrite a host's own.
 * @param {object} vm the scratch-vm instance
 * @returns {boolean} true if the hook was installed
 */
import {confirmAsync} from './native-dialog.js';

const installExtensionConfirm = function (vm) {
    const runtime = vm && vm.runtime;
    if (!runtime) return false;
    if (typeof runtime.confirmAsync === 'function') return false;
    runtime.confirmAsync = message => confirmAsync(String(message));
    return true;
};

export default installExtensionConfirm;
export {installExtensionConfirm};
