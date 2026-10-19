// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The LWP3 hubs as HubProfiles (hubs/hub-profile.js; docs/ROBOT-LAB-HUBS-PLAN.md P3): the
// BOOST Move Hub, the Powered Up (City) Hub, the Technic (Control+) Hub and the SPIKE
// Essential hub. All four speak LEGO Wireless Protocol 3 (lwp3-protocol.js) and drive LPF2
// motors through a speed-regulating controller (lwp3-controller.js), so their ports take
// `pwm` drives, as SPIKE Prime's do (owner decision D5).
//
// Per hub the data the protocol needs besides the profile: the System Type ID it reports
// (§2.1, property 0x0B), the advertised name, and the LWP3 port id of each connector and
// internal device. LEGO's document gives the port-id RANGES (§3.8.2: 0–49 hub connectors,
// 50–100 internal) but not each hub's assignment; those are the community's (node-poweredup
// src/hubs/*.ts portMap, pybricks), cited per hub below. Parts: the LDraw files of the
// 2026-09-30 library (checked against the library, docs/LWP3-VIRTUAL-HUB-NOTES.md "Parts").

import {HUB_SUPPLY_VOLTS} from '../../devices/catalog.js';
import {IO_TYPE, SYSTEM_TYPE} from './lwp3-protocol.js';

const label = (en, de) => Object.freeze({en, de});

const lpf2Port = id => Object.freeze({
    id,
    label: label(`Port ${id}`, `Port ${id}`),
    kind: 'lpf2',
    accepts: Object.freeze(['motor', 'sensor-lpf2']),
    // 6 AA/AAA cells (devices/catalog.js HUB_SUPPLY_VOLTS['powered-up']); sag not modelled.
    supplyVolts: HUB_SUPPLY_VOLTS['powered-up'].volts,
    identifies: 'lpf2-id'
});

/** An internal motor port (the Move Hub's A and B): the motor is part of the hub. */
const internalMotorPort = id => Object.freeze({...lpf2Port(id), label: label(`Port ${id} (built-in motor)`, `Port ${id} (eingebauter Motor)`)});

/**
 * @typedef {object} Lwp3HubType
 * @property {import('../hub-profile.js').HubProfile} profile
 * @property {number} systemType     §2.1 / property 0x0B
 * @property {string} advertisedName §3.5.5 property 0x01 (also the BLE device name)
 * @property {Object<string, number>} portIds   profile port id → LWP3 port id
 * @property {{port: number, type: number, device: string}[]} internal  internal devices announced at connect
 * @property {Object<string, string>} [builtInMotors]  profile port → catalogue motor device
 * @property {string} source         where the port map comes from
 */

const hubType = ({id, name, part, ports, systemType, advertisedName, portIds, internal, builtInMotors = {}, imu = null, source}) => {
    const profile = Object.freeze({
        id,
        name,
        parts: Object.freeze([part]),
        ports: Object.freeze(ports),
        internalDevices: Object.freeze(Object.entries(builtInMotors).map(([port, device]) => Object.freeze({device, port, body: 'hub'}))
            .concat(imu ? [Object.freeze({device: imu, port: 'imu', body: 'hub'})] : [])),
        clock: Object.freeze({controllerStepMs: 5}),
        drive: 'pwm',
        // Blocks over Web Bluetooth or Scratch Link (virtual-hub/lwp3-peripheral.js) and the Robot Lab API.
        routes: Object.freeze(['legopoweredup-extension', 'legoboostunified-extension', 'boost-extension', 'robot-lab-api'])
    });
    return Object.freeze({profile, systemType, advertisedName, portIds: Object.freeze(portIds),
        internal: Object.freeze(internal.map(i => Object.freeze(i))), builtInMotors: Object.freeze(builtInMotors), source});
};

const LED = {port: 0x32, type: IO_TYPE.RGB_LIGHT, device: 'hub-led'};

/** BOOST Move Hub (set 17101's hub, 88006; LDraw 26910). */
export const MOVE_HUB = hubType({
    id: 'boost-move-hub',
    name: label('BOOST Move Hub', 'BOOST-Move-Hub'),
    part: '26910.dat',
    ports: [internalMotorPort('A'), internalMotorPort('B'), lpf2Port('C'), lpf2Port('D')],
    systemType: SYSTEM_TYPE.MOVE_HUB,
    advertisedName: 'LEGO Move Hub',
    portIds: {A: 0x00, B: 0x01, C: 0x02, D: 0x03},
    internal: [LED, {port: 0x3a, type: IO_TYPE.INTERNAL_TILT, device: 'move-hub-tilt'},
        {port: 0x3b, type: IO_TYPE.CURRENT, device: 'current'}, {port: 0x3c, type: IO_TYPE.VOLTAGE, device: 'voltage'}],
    builtInMotors: {A: 'boost-move-hub-motor', B: 'boost-move-hub-motor'},
    imu: 'move-hub-tilt',
    source: 'node-poweredup src/hubs/movehub.ts portMap (A 0, B 1, C 2, D 3, HUB_LED 50, TILT_SENSOR 58, CURRENT 59, VOLTAGE 60) — community; ' +
        'LWP3 §2.1 System Type 0x40 "Boost Hub" — LEGO'
});

/** Powered Up Hub, "City hub" (88009; LDraw 28738). */
export const CITY_HUB = hubType({
    id: 'pup-city-hub',
    name: label('Powered Up Hub (City)', 'Powered-Up-Hub (City)'),
    part: '28738.dat',
    ports: [lpf2Port('A'), lpf2Port('B')],
    systemType: SYSTEM_TYPE.TWO_PORT_HUB,
    advertisedName: 'HUB NO.4',
    portIds: {A: 0x00, B: 0x01},
    internal: [LED, {port: 0x3b, type: IO_TYPE.CURRENT, device: 'current'}, {port: 0x3c, type: IO_TYPE.VOLTAGE, device: 'voltage'}],
    source: 'node-poweredup src/hubs/hub.ts portMap (A 0, B 1, HUB_LED 50, CURRENT 59, VOLTAGE 60) — community; ' +
        'LWP3 §2.1 System Type 0x41 "2 Port Hub" — LEGO'
});

/** Technic Hub, "Control+ hub" (88012; LDraw 22127). */
export const TECHNIC_HUB = hubType({
    id: 'technic-hub',
    name: label('Technic Hub (Control+)', 'Technic-Hub (Control+)'),
    part: '22127.dat',
    ports: [lpf2Port('A'), lpf2Port('B'), lpf2Port('C'), lpf2Port('D')],
    systemType: SYSTEM_TYPE.TECHNIC_MEDIUM_HUB,
    advertisedName: 'Technic Hub',
    portIds: {A: 0x00, B: 0x01, C: 0x02, D: 0x03},
    internal: [LED, {port: 0x3b, type: IO_TYPE.CURRENT, device: 'current'}, {port: 0x3c, type: IO_TYPE.VOLTAGE, device: 'voltage'},
        {port: 0x3d, type: IO_TYPE.TECHNIC_HUB_TEMPERATURE, device: 'temperature'},
        {port: 0x61, type: IO_TYPE.TECHNIC_HUB_ACCELEROMETER, device: 'accelerometer'},
        {port: 0x62, type: IO_TYPE.TECHNIC_HUB_GYRO, device: 'gyro'},
        {port: 0x63, type: IO_TYPE.TECHNIC_HUB_TILT, device: 'technic-hub-tilt'}],
    imu: 'technic-hub-tilt',
    source: 'node-poweredup src/hubs/technicmediumhub.ts portMap (A–D 0–3, HUB_LED 50, CURRENT 59, VOLTAGE 60, TEMPERATURE 61, ' +
        'ACCELEROMETER 97, GYRO 98, TILT 99) and System Type 0x80 (BLEManufacturerData TECHNIC_MEDIUM_HUB) — community'
});

/** SPIKE Essential hub (45609; LDraw 67351, the 2-port hub without its battery). */
export const SPIKE_ESSENTIAL_HUB = hubType({
    id: 'spike-essential',
    name: label('SPIKE Essential hub', 'SPIKE-Essential-Hub'),
    part: '67351.dat',
    ports: [lpf2Port('A'), lpf2Port('B')],
    systemType: SYSTEM_TYPE.TECHNIC_SMALL_HUB,
    advertisedName: 'SPIKE Essential',
    portIds: {A: 0x00, B: 0x01},
    internal: [{port: 0x31, type: IO_TYPE.RGB_LIGHT, device: 'hub-led'},
        {port: 0x3c, type: IO_TYPE.TECHNIC_HUB_TEMPERATURE, device: 'temperature'},
        {port: 0x61, type: IO_TYPE.TECHNIC_HUB_ACCELEROMETER, device: 'accelerometer'},
        {port: 0x62, type: IO_TYPE.TECHNIC_HUB_GYRO, device: 'gyro'},
        {port: 0x63, type: IO_TYPE.TECHNIC_HUB_TILT, device: 'technic-hub-tilt'}],
    imu: 'technic-hub-tilt',
    source: 'node-poweredup src/hubs/technicsmallhub.ts portMap (A 0, B 1, HUB_LED 49, …, ACCELEROMETER 97, GYRO 98, TILT 99) and ' +
        'System Type 0x83 (TECHNIC_SMALL_HUB) — community'
});

/** Every LWP3 hub type, by profile id. */
export const LWP3_HUB_TYPES = Object.freeze(new Map([MOVE_HUB, CITY_HUB, TECHNIC_HUB, SPIKE_ESSENTIAL_HUB].map(t => [t.profile.id, t])));
