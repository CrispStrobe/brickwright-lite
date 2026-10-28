// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// "Virtual NXT": the scene's NXT brick as a Scratch Link BT-classic peripheral
// (lib/virtual-hub/bt-classic-registry.js; docs/ROBOT-LAB-EV3-NXT.md "The transport"). The legonxt
// extension discovers toy/robot devices (major class 8, minor 1), the user (or the Robot Lab's Run)
// picks this one, it connects with the NXT's pairing PIN, and sends telegrams each preceded by its
// two Bluetooth length bytes (NXT Bluetooth Developer Kit Appendix 1); every telegram is executed
// at once (nxt-direct-commands.js) and a reply, when one is asked for, goes back with its own two
// length bytes.

import {executeTelegram, telegramReader, withLength} from './nxt-direct-commands.js';

export const NXT_PERIPHERAL_ID = 'brickwright-robot-lab-nxt';
export const NXT_PERIPHERAL_NAME = 'Virtual NXT';

/**
 * @param {() => object|null} getHub the scene's NxtVirtualHub now
 * @param {{send: (bytes: Uint8Array) => void}} link
 * @param {{onTelegram?: Function}} [hooks] onTelegram(telegram, result): every executed telegram
 */
export const createNxtSession = (getHub, link, {onTelegram = null} = {}) => {
    const read = telegramReader();
    return {
        receive (bytes) {
            for (const telegram of read(bytes)) {
                const hub = getHub();
                if (!hub) return;
                const result = executeTelegram(telegram, hub);
                if (onTelegram) onTelegram(telegram, result);
                if (result.reply) link.send(withLength(result.reply));
            }
        },
        close () {}
    };
};

export const nxtClassicPeripheral = (getHub, hooks = {}) => Object.freeze({
    id: NXT_PERIPHERAL_ID,
    name: NXT_PERIPHERAL_NAME,
    majorDeviceClass: 8,
    minorDeviceClass: 1,
    available: () => Boolean(getHub()),
    open: link => createNxtSession(getHub, link, hooks)
});
