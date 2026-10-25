// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// "Robot Lab RCX": the virtual `rcxDownload` target (lib/rcx/rcx-targets.js)
// that puts a compiled `.rcx` image into the RCX of the Lab's scene instead of
// sending it through the IR tower. The RCX blocks' download block and the NQC
// tab's "send to brick" reach it through the runtime hook unchanged, once the
// user has chosen it as the target (the Robot Lab pane's target picker).
//
// A download loads the program and, unless options.run === false, starts it —
// as a real RCX does when one presses Run after the download. Between the
// download and the next physics step nothing moves: the program's first
// instruction runs on the Lab's clock.

/** The target's id (lib/rcx/rcx-targets.js). */
export const ROBOT_LAB_RCX_TARGET = 'robot-lab';

/**
 * @param {() => (import('./rcx-virtual-hub.js').RcxVirtualHub|null)} getHub the scene's RCX now (null: none)
 * @param {{onLoaded?: (bytes: Uint8Array, hub: object) => void}} [hooks] after the load (and start): e.g. the pane
 *        keeping the image across a reset and starting its clock
 */
export const robotLabRcxTarget = (getHub, {onLoaded = null} = {}) => Object.freeze({
    id: ROBOT_LAB_RCX_TARGET,
    name: Object.freeze({en: 'Robot Lab RCX', de: 'Robot-Lab-RCX'}),
    download (bytes, options = {}) {
        const hub = getHub();
        if (!hub) return {ok: false, log: 'the Robot Lab scene has no RCX (nothing was loaded)'};
        const loaded = hub.loadProgram(bytes);
        if (!loaded.ok) return loaded;
        const started = options.run === false ? false : hub.run();
        if (onLoaded) onLoaded(bytes, hub);
        return {ok: true, log: `Robot Lab RCX: ${loaded.log}${started ? ', running' : ''}`, target: ROBOT_LAB_RCX_TARGET};
    }
});
