// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// "Virtual EV3": the scene's EV3 brick as a Scratch Link BT-classic peripheral
// (lib/virtual-hub/bt-classic-registry.js; docs/ROBOT-LAB-EV3-NXT.md "The transport"). An EV3
// extension discovers it as a toy/robot (major device class 8, minor 1 — what the stock `ev3` and
// ev3comprehensive ask Scratch Link for), connects with the EV3's pairing PIN, and sends direct
// command frames; this session cuts the RFCOMM byte stream into frames by their two length bytes
// (EV3 Communication Developer Kit §4), runs each on the brick (ev3-direct-commands.js), and
// sends a reply when one is asked for.
//
// One direct command runs at a time, in the order they came, as in the brick's single direct-
// command thread [CDK §2]: one that blocks (OUTPUT_READY …) holds the ones behind it, and is
// resumed each time the hub publishes a physics batch.

import {startDirectCommand, stepDirectCommand, parseFrame, systemCommandReply,
    SYSTEM_COMMAND_REPLY, SYSTEM_COMMAND_NO_REPLY} from './ev3-direct-commands.js';

export const EV3_PERIPHERAL_ID = 'brickwright-robot-lab-ev3';
export const EV3_PERIPHERAL_NAME = 'Virtual EV3';
/** A frame larger than this is refused (the EV3's own direct-command limit is 1024 bytes of globals). */
const MAX_FRAME = 1024 + 64;

/**
 * A session of one connection to the brick getHub() returns.
 * @param {() => object|null} getHub the scene's Ev3VirtualHub now
 * @param {{send: (bytes: Uint8Array) => void, close: () => void}} link
 * @param {{onCommand?: Function}} [hooks] onCommand(trace, frame): every finished command (the pane's log)
 */
export const createEv3Session = (getHub, link, {onCommand = null} = {}) => {
    let buffer = new Uint8Array(0);
    const queue = [];
    let current = null;
    let pumping = false;
    let unsubscribe = null;
    let hub = null;

    const watch = () => {
        const now = getHub();
        if (now === hub) return now;
        if (unsubscribe) unsubscribe();
        hub = now;
        unsubscribe = hub && typeof hub.onChange === 'function' ? hub.onChange(() => pump()) : null;
        return hub;
    };

    const pump = () => {
        if (pumping) return;
        pumping = true;
        try {
            for (;;) {
                const brick = watch();
                if (!brick) return;
                if (!current) {
                    const packet = queue.shift();
                    if (!packet) return;
                    const frame = parseFrame(packet);
                    if (frame.type === SYSTEM_COMMAND_REPLY || frame.type === SYSTEM_COMMAND_NO_REPLY) {
                        const reply = systemCommandReply(frame);
                        if (reply) link.send(reply);
                        continue;
                    }
                    current = startDirectCommand(packet);
                }
                const out = stepDirectCommand(current, brick);
                if (!out.done) return;
                if (onCommand) onCommand(current.trace, current.frame, out.error);
                current = null;
                if (out.reply) link.send(out.reply);
            }
        } finally {
            pumping = false;
        }
    };

    return {
        receive (bytes) {
            const next = new Uint8Array(buffer.length + bytes.length);
            next.set(buffer);
            next.set(bytes, buffer.length);
            buffer = next;
            while (buffer.length >= 2) {
                const length = buffer[0] | (buffer[1] << 8);
                if (length + 2 > MAX_FRAME) {
                    buffer = new Uint8Array(0);
                    throw new RangeError(`an EV3 frame of ${length} bytes is more than the brick takes`);
                }
                if (buffer.length < length + 2) break;
                queue.push(buffer.slice(0, length + 2));
                buffer = buffer.slice(length + 2);
            }
            pump();
        },
        close () {
            if (unsubscribe) unsubscribe();
            unsubscribe = null;
            queue.length = 0;
            current = null;
        },
        /** Commands not yet answered (tests). */
        get pending () { return queue.length + (current ? 1 : 0); }
    };
};

/**
 * The registry entry: available while the scene has an EV3.
 * @param {() => object|null} getHub
 */
export const ev3ClassicPeripheral = (getHub, hooks = {}) => Object.freeze({
    id: EV3_PERIPHERAL_ID,
    name: EV3_PERIPHERAL_NAME,
    majorDeviceClass: 8,
    minorDeviceClass: 1,
    available: () => Boolean(getHub()),
    open: link => createEv3Session(getHub, link, hooks)
});
