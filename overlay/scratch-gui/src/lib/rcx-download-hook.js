/**
 * Give the RCX extension a way to reach a brick, so the toolchain has a button.
 *
 * Until this existed the RCX tier stopped one step short of useful: NQC
 * compiles locally (lib/nqc-runtime-hook.js), the protocol and the Web Serial
 * transport are written and tested — and nothing called either of them, which
 * the dead-module ratchet said out loud. The extension saved the `.rcx` for a
 * desktop tool instead.
 *
 * THE CONTRACT IS `(bytes, options) -> {ok, log, phase?}`, deliberately the
 * same shape as `runtime.nqcCompile`, because the extension already knows how
 * to treat a host-installed function as optional: it looks the name up at call
 * time and falls back when it is absent. An app without this hook keeps saving
 * the file, which is the behaviour it has today.
 *
 * WHAT THIS DOES NOT DO, AND WHY. It does not hold the port open between
 * downloads. Web Serial grants access to a port, not a session, and a tower
 * left open is a tower no other tab or tool can use — including the desktop
 * NQC someone may still be using alongside this. Opening per download costs a
 * few milliseconds and removes a whole class of "it worked until I opened
 * Bricx" complaints.
 *
 * It also does not ask whether the brick has firmware. It cannot: a brick with
 * no firmware answers nothing, which is indistinguishable from no brick and no
 * tower. See docs/RCX-FIRMWARE.md — the honest thing is to say so in the UI
 * beforehand, not to guess afterwards.
 */

/**
 * @param {object} vm the scratch-vm instance
 * @returns {boolean} true if the hook was installed
 */
const installRcxDownloader = function (vm) {
    const runtime = vm && vm.runtime;
    if (!runtime) return false;
    // Idempotent, and it does not overwrite: a desktop build that can drive a
    // real serial port without the browser's permission dance has a better
    // implementation than this one and must win. Same rule as the compiler.
    if (typeof runtime.rcxDownload === 'function') return false;

    runtime.rcxDownload = async function (bytes, options = {}) {
        let link = null;
        try {
            const [{parseRcxImage, downloadImage}, {openRcxSerial, requestRcxPort}] =
                await Promise.all([
                    import(/* webpackChunkName: "rcx-link" */ './rcx/rcx-protocol.js'),
                    import(/* webpackChunkName: "rcx-link" */ './rcx/rcx-serial.js')
                ]);

            const image = parseRcxImage(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
            if (!image.ok) {
                // Refuse BEFORE asking for a port. Prompting the user to pick a
                // tower and only then admitting the image is unusable wastes a
                // gesture and reads as a hardware fault.
                return {ok: false, log: `not a usable .rcx image: ${image.error} — ${image.detail}`};
            }

            // `requestPort()` needs a user gesture, so this whole function has
            // to be called from one. A caller may pass a port it already has —
            // from `navigator.serial.getPorts()`, which needs no gesture — and
            // that is the path a "download again" button should take.
            const port = options.port || await requestRcxPort(options.filters || []);
            link = await openRcxSerial(port, {alreadyOpen: Boolean(options.port && options.portIsOpen)});

            const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
            const result = await downloadImage(image, {
                send: link.send,
                programSlot: options.programSlot ?? 0,
                startTask: options.startTask ?? null,
                onProgress: progress
            });
            return {ok: true, log: `downloaded ${result.chunks} chunk(s)`, chunks: result.chunks};
        } catch (e) {
            // Everything arrives as a refusal in the shape above rather than a
            // rejected promise: the extension awaits this without a catch, and
            // an exception would surface as an unhandled rejection with the
            // user told nothing at all.
            //
            // The two failures worth naming are the ones a user meets most.
            const message = String((e && e.message) || e);
            if (/no port selected|NotFoundError/i.test(message)) {
                return {ok: false, log: 'no tower was chosen', cancelled: true};
            }
            if (/no valid reply|NO_REPLY/i.test(message)) {
                return {ok: false, log:
                    'the brick did not answer. Check it is switched on, in range of the tower, ' +
                    'and has firmware — see docs/RCX-FIRMWARE.md; a brick without firmware ' +
                    'answers exactly like a brick that is not there.'};
            }
            return {ok: false, log: message};
        } finally {
            if (link) await link.close().catch(() => {});
        }
    };
    return true;
};

export default installRcxDownloader;
export {installRcxDownloader};
