// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's radio hubs as virtual BLE peripherals (docs/ROBOT-LAB-HUBS-PLAN.md P0, P3): an
// LWP3 hub (BOOST Move Hub, Powered Up City Hub, Technic Hub, SPIKE Essential;
// bw-sim/hubs/lwp3/) or a WeDo 2.0 Smart Hub (bw-sim/hubs/wedo2/) of the scene now open is
// offered through the virtual peripheral registry (web-bluetooth-shim.js
// registerVirtualPeripheral), so the REAL LEGO extensions reach it over Web Bluetooth or over the
// Scratch Link BLE double (scratch-link-ble.js), byte for byte as they would reach a hub. This
// module is only the GATT surface: every byte goes to the hub's own protocol (`receive` /
// `onWrite`), every notification comes from it (its sink), asynchronously as over a radio.
//
// A peripheral carries the hub as `hubState`, so connectVirtualHub (connect-virtual-hub.js) picks
// exactly the scene's hub.

import {registerVirtualPeripheral} from './web-bluetooth-shim.js';
import {LWP3_SERVICE, LWP3_CHARACTERISTIC, LEGO_COMPANY_ID} from '../bw-sim/hubs/lwp3/lwp3-protocol.js';
import {WEDO2_GATT, WEDO2_SERVICE} from '../bw-sim/hubs/wedo2/wedo2-protocol.js';
import {WEDO2_NAME} from '../bw-sim/hubs/wedo2/wedo2-virtual-hub.js';

/** A notification as a radio delivers it: after the current call returns. */
const later = fn => (typeof queueMicrotask === 'function' ? queueMicrotask(fn) : Promise.resolve().then(fn));

/**
 * The LWP3 hub's GATT peripheral (LWP3 §3: one service 0x1623, one characteristic 0x1624, every
 * message both ways), advertising LEGO's manufacturer data (§2: company 0x0397, then button
 * state, System Type and Device Number, capabilities, last network, status, option).
 */
export class Lwp3Peripheral {
    constructor (hub) {
        this.hub = hub;
        this.hubState = hub;
        this.id = `brickwright-lab-${hub.profile.id}-${hub.id}`;
        this.name = hub.type.advertisedName;
        this.services = [{uuid: LWP3_SERVICE, characteristics: [{uuid: LWP3_CHARACTERISTIC}]}];
        // §2.2 capabilities 0x02 (peripheral role) | 0x04 (LPF2 devices); §2.4 status 0x01 ("I can be Peripheral").
        this.manufacturerData = {[LEGO_COMPANY_ID]: [0x00, hub.type.systemType, 0x06, 0x00, 0x01, 0x00]};
        this.connected = false;
    }

    connect () {
        this.connected = true;
    }

    disconnect () {
        this.connected = false;
        this.hub.setSink(null);
    }

    setNotificationSink (fn) {
        if (!fn) {
            this.hub.setSink(null);
            return;
        }
        this.hub.setSink(bytes => {
            const copy = Uint8Array.from(bytes);
            later(() => { if (this.connected) fn(LWP3_CHARACTERISTIC, copy); });
        });
    }

    onStartNotifications (uuid) {
        if (uuid === LWP3_CHARACTERISTIC) this.hub.announce();
    }

    onWrite (uuid, bytes) {
        if (uuid !== LWP3_CHARACTERISTIC) throw new Error(`no characteristic ${uuid} on the LWP3 hub`);
        this.hub.receive(Uint8Array.from(bytes));
    }

    dispose () {
        if (this.connected) this.disconnect();
    }
}

/** The WeDo 2.0 hub's GATT peripheral (its own services; bw-sim/hubs/wedo2/wedo2-protocol.js). */
export class Wedo2Peripheral {
    constructor (hub) {
        this.hub = hub;
        this.hubState = hub;
        this.id = `brickwright-lab-wedo2-${hub.id}`;
        this.name = WEDO2_NAME;
        this.services = WEDO2_GATT.map(s => ({uuid: s.uuid, characteristics: s.characteristics.map(c => ({uuid: c.uuid}))}));
        this.connected = false;
    }

    connect () {
        this.connected = true;
    }

    disconnect () {
        this.connected = false;
        this.hub.setSink(null);
    }

    setNotificationSink (fn) {
        if (!fn) {
            this.hub.setSink(null);
            return;
        }
        this.hub.setSink((uuid, bytes) => {
            const copy = Uint8Array.from(bytes);
            later(() => { if (this.connected) fn(uuid, copy); });
        });
    }

    onStartNotifications (uuid) {
        this.hub.startNotifications(uuid);
    }

    read (uuid) {
        return this.hub.read(uuid);
    }

    onWrite (uuid, bytes) {
        this.hub.onWrite(uuid, Uint8Array.from(bytes));
    }

    dispose () {
        if (this.connected) this.disconnect();
    }
}

/** The service a host filters a WeDo 2.0 hub by (advertised). */
export {WEDO2_SERVICE};

/**
 * Offers the scene's radio hubs as virtual peripherals while registered.
 * @param {() => object[]} getHubs the VirtualHubs of the scene now open ([] when none)
 * @returns {Function} unregister
 */
export const registerRobotLabBlePeripherals = getHubs => {
    const made = new Set();
    const factory = (protocol, Make) => registerVirtualPeripheral(() => {
        const hub = (getHubs() || []).find(h => h && h.protocol === protocol);
        if (!hub) return null;
        const p = new Make(hub);
        made.add(p);
        return p;
    });
    const off = [factory('lwp3', Lwp3Peripheral), factory('wedo2', Wedo2Peripheral)];
    return () => {
        for (const f of off) f();
        for (const p of made) p.dispose();
        made.clear();
    };
};
