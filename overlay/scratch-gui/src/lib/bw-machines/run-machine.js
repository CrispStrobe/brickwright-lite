// Machine Manager — run a machine config in the GUI (design §8 step 2, §4.2).
//
// The "run this machine" action, shared by the manager UI and the quick-picker.
// It adds NO new runner path: it resolves a config's media with activateConfig
// (fetch + sha-verify only on activation) and hands the bytes to the debug
// panel's EXISTING boot path via the `bw-machine-media-load` event — the same
// event the Machine Loader already dispatches. The one thing it adds to that
// event is the config's declared screen `widgets`, so a machine that names a
// `source:'video'` display mirrors its framebuffer into the Widgets pane
// (debug-panel starts the mirror after boot).
//
// Framework-free: the event dispatch and the image fetcher are both injectable,
// so a Node test drives this without a DOM or the network.

import {activateConfig, defaultImageFetcher} from './activate.js';

/**
 * Boot a machine config.
 *
 * @param {object} config a machine config (normalized+validated by activateConfig)
 * @param {object} [opts]
 * @param {(detail: object) => void} [opts.dispatch] emit the media-load event
 *   (default: a `bw-machine-media-load` CustomEvent on the global)
 * @param {(ref: object) => Promise<{bytes: Uint8Array}>} [opts.fetcher] image fetcher
 * @returns {Promise<object>} `{mode:'wired', activated}` for a wired machine
 *   (realized in the circuit designer, not booted here), else
 *   `{mode:'functional', activated, detail}` where `detail` is the event payload.
 */
export async function runMachineConfig(config, opts = {}) {
    const dispatch = typeof opts.dispatch === 'function'
        ? opts.dispatch
        : detail => {
            if (typeof globalThis.dispatchEvent !== 'function' ||
                typeof globalThis.CustomEvent !== 'function') {
                throw new Error('no DOM event target to boot the machine on');
            }
            globalThis.dispatchEvent(new globalThis.CustomEvent('bw-machine-media-load', {detail}));
        };

    const activated = await activateConfig(config, {
        fetcher: opts.fetcher || defaultImageFetcher
    });

    // A wired machine is realized on the breadboard/circuit designer, not booted
    // from an image here (design §3). Hand the descriptor back for the caller to
    // route into the designer; nothing to dispatch.
    if (activated.mode === 'wired') {
        return {mode: 'wired', activated};
    }

    const bm = activated.bootMedia;
    const detail = {
        slotId: bm.slot,
        bytes: bm.bytes,
        kind: activated.targetKind,
        profile: bm.profile || null,
        name: bm.name || null,
        // The declared screen widget rides here so debug-panel mirrors video
        // into the Widgets pane; an empty array simply means no screen (video
        // stays in the Debug instrument).
        widgets: Array.isArray(activated.widgets) ? activated.widgets : []
    };
    if (typeof bm.romAt === 'number') detail.romAt = bm.romAt;
    // An inline machineConfig ({regions,chips}) — the Eater 6502 case — carries
    // the program's hardware as `chips`; a string preset (PCXT8086) is built by
    // the boot path itself and needs nothing here.
    if (activated.machineConfig && Array.isArray(activated.machineConfig.chips)) {
        detail.chips = activated.machineConfig.chips;
    }

    dispatch(detail);
    return {mode: 'functional', activated, detail};
}
