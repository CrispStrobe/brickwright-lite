// SPDX-License-Identifier: BSD-3-Clause
/**
 * Run LEGO SPIKE App 3 Python on the virtual SPIKE hub — by NOT running Python.
 *
 * A SPIKE 3 program is read into SPIKE blocks by the vendored reader
 * (sb3-creator-spike3.js, reached through sb3-creator-python.js), and the
 * blocks run in the Scratch VM through the shipping spikeprime extension, over
 * Web Bluetooth, to the virtual hub. That hub is the one the arena, the word
 * blocks and the SPIKE panel all see, so there is one world, not two.
 *
 * This module is the small browser half: detect a SPIKE 3 program, and once
 * the Code tab has loaded its blocks, connect the extension to the virtual hub
 * and press the green flag. print() is a `say` block; its text is handed to
 * the caller from the VM's SAY events.
 *
 * @module
 */

/**
 * The import lines that make a file SPIKE App 3 Python. The same expression as
 * the vendored reader's SPIKE3_IMPORT (sb3-creator-spike3.js), restated here so
 * deciding whether to SHOW the button does not pull the whole reader into the
 * Code tab's first chunk; test/spike3-python-import.test.mjs holds the two equal.
 */
export const SPIKE3_IMPORT = /^\s*(?:import\s+(?:runloop|motor_pair|motor|color_sensor|distance_sensor|force_sensor)\b|from\s+hub\s+import\b)/m;

export const isSpike3Program = source => SPIKE3_IMPORT.test(String(source || ''));

const CONNECT_WAIT_MS = 5000;

/**
 * Connect the loaded spikeprime extension to the virtual hub and start the program.
 *
 * @param {object} vm the GUI's VM, with the program's blocks already loaded
 * @param {{onPrint?: function(string), window?: object}} [options]
 * @returns {Promise<{ok: true, stop: function} | {ok: false, reason: string, detail?: string}>}
 */
export async function runSpike3OnVirtualHub (vm, options = {}) {
    const win = options.window || (typeof window === 'undefined' ? globalThis : window);
    const virtualHub = win.__brickwrightVirtualSpike;
    if (!virtualHub || typeof virtualHub.enable !== 'function') return {ok: false, reason: 'no-hub'};
    const primitives = (vm && vm.runtime && vm.runtime._primitives) || {};
    const call = (op, args = {}) => {
        const fn = primitives[`spikeprime_${op}`];
        if (typeof fn !== 'function') throw new Error(`the spikeprime extension has no ${op} block loaded`);
        return fn(args, {runtime: vm.runtime, target: vm.runtime.getEditingTarget && vm.runtime.getEditingTarget()});
    };
    virtualHub.enable(true);
    try {
        if (!call('isConnected')) {
            // The virtual hub is reached over Web Bluetooth. Naming the route skips
            // the Scratch Link probe; answering the chooser skips the dialog that
            // would otherwise ask whether this virtual device is the one meant.
            const previousChooser = win.__brickwrightChooseVirtualBluetooth;
            win.__brickwrightChooseVirtualBluetooth = candidates => candidates[0];
            try {
                call('setConnectionMode', {MODE: 'web-ble'});
                await call('connectHub');
                const started = Date.now();
                while (!call('isConnected') && Date.now() - started < CONNECT_WAIT_MS) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            } finally {
                win.__brickwrightChooseVirtualBluetooth = previousChooser;
            }
            if (!call('isConnected')) return {ok: false, reason: 'no-connect'};
        }
    } catch (error) {
        return {ok: false, reason: 'no-connect', detail: error && error.message};
    }
    const onSay = (target, type, text) => {
        if (typeof options.onPrint === 'function' && text !== '') options.onPrint(text);
    };
    // While this run owns the console, print() is the console's: the stage's
    // speech-bubble renderer is detached for the run and put back on Stop. The
    // Code tab can hold the stage at zero size, where measuring a bubble throws
    // (Chromium: "getImageData ... source width is 0") — CI saw exactly that.
    const bubbles = typeof vm.runtime.listeners === 'function' ? vm.runtime.listeners('SAY') : [];
    for (const listener of bubbles) vm.runtime.removeListener('SAY', listener);
    vm.runtime.on('SAY', onSay);
    vm.greenFlag();
    let stopped = false;
    return {
        ok: true,
        stop () {
            if (stopped) return;
            stopped = true;
            vm.stopAll();
            vm.runtime.removeListener('SAY', onSay);
            for (const listener of bubbles) vm.runtime.on('SAY', listener);
        }
    };
}
