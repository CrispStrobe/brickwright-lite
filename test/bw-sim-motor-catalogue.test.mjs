// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The motor catalogue (overlay/scratch-gui/src/lib/bw-sim/devices/catalog.js) against its sources
 * (owner decision D6: Philo's LEGO motor comparison, https://philohome.com/motors/motorcomp.htm,
 * read from the Internet Archive snapshot of 2026-09-18).
 *
 *   - every motor is self-consistent: its line at the nominal voltage is the fitted DC model's
 *     (τs = k_t·(V/R − i0), ω0 = (V − R·i0)/k_e, τf = k_t·i0);
 *   - the SPIKE motors reproduce Philo's 9 V numbers, transcribed HERE from his tables (not read
 *     back from the catalogue), within 5 %;
 *   - the fit against his load points (the measurements it was NOT fitted to): residuals reported,
 *     speeds within 15 %;
 *   - LEGO's 7.2 V fact sheets: within the sheets' own ±15 % on speed, the rest agree within 15 %
 *     or are a documented disagreement (which must still be one);
 *   - every number names its source.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEVICE_MODELS, deviceModels, dcLineAt, fitDcModel, HUB_SUPPLY_VOLTS, PHILO_TAG, PHILO_SNAPSHOT, validateDeviceModel}
    from '../overlay/scratch-gui/src/lib/bw-sim/devices/catalog.js';
import {dcMotorCommand} from '../overlay/scratch-gui/src/lib/bw-sim/physics/actuators.js';
import {SPIKE_PRIME_PROFILE} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/profile.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RPM = 2 * Math.PI / 60;
const MOTORS = DEVICE_MODELS.filter(d => d.class === 'motor');
const rel = (a, b) => a / b - 1;
const pct = x => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)} %`;

/**
 * Philo's 9 V figures for the SPIKE motors, transcribed from the page's "No-load characteristics"
 * and "Stalled characteristics" tables (columns "Spike M", "Spike L"), and LEGO's 7.2 V sheets.
 */
const PHILO_9V = {
    'spike-medium-angular': {rpm: 228, noLoadA: 0.100, stallNcm: 13.5, stallA: 0.85},
    'spike-large-angular': {rpm: 213, noLoadA: 0.110, stallNcm: 33.5, stallA: 1.8}
};
const LEGO_72V = {
    'spike-medium-angular': {rpm: 185, noLoadA: 0.110, stallNcm: 18, stallA: 0.8, load: {ncm: 3.5, rpm: 135}},
    'spike-large-angular': {rpm: 175, noLoadA: 0.135, stallNcm: 25, stallA: 1.4, load: {ncm: 8, rpm: 135}}
};
/** Where the fit and LEGO's sheet disagree by more than 15 % (and why it is Philo's number that is used). */
const DISAGREE = {
    // LEGO's 18 N·cm is 72 % above Philo's 13.5 N·cm at 9 V scaled to 7.2 V; Pybricks' identified
    // model (16 N·cm) lies between. The owner chose Philo (D6).
    'spike-medium-angular stall torque': true,
    // R = 9 V / 0.85 A gives 0.68 A at 7.2 V, LEGO says 0.8 A: −15.0 %, on the edge (a stalled
    // winding warms and its resistance rises while it is measured; sample spread).
    'spike-medium-angular stall current': true,
    // Philo measured 110 mA at no load on his sample, LEGO says 135 mA: sample spread.
    'spike-large-angular no-load current': true
};

/** The model's speed (rpm) and current (A) at a load torque, supply V. */
const atLoad = (motor, volts, ncm) => {
    const line = dcLineAt(motor, volts);
    const w = line.noLoadRadPerSec * (1 - ncm / 100 / line.stallTorqueNm);
    return {rpm: w / RPM, amps: (volts - motor.backEmfVsPerRad * w) / motor.resistanceOhm};
};

test('every motor is the fitted DC model, self-consistent at its nominal voltage', () => {
    assert.ok(MOTORS.length >= 20, `${MOTORS.length} motors`);
    for (const d of MOTORS) {
        assert.deepEqual(validateDeviceModel(d), [], d.id);
        const m = d.motor;
        const {resistanceOhm: R, torqueConstantNmPerA: kt, backEmfVsPerRad: ke, noLoadCurrentA: i0, nominalVolts: V} = m;
        for (const [k, v] of Object.entries({R, kt, ke, V})) assert.ok(v > 0, `${d.id}: ${k} ${v}`);
        assert.ok(Math.abs(m.stallTorqueNm - kt * (V / R - i0)) < 1e-12, `${d.id}: τs = k_t·(V/R − i0)`);
        assert.ok(Math.abs(m.noLoadRadPerSec - (V - R * i0) / ke) < 1e-9, `${d.id}: ω0 = (V − R·i0)/k_e`);
        assert.ok(Math.abs(m.frictionTorqueNm - kt * i0) < 1e-12, `${d.id}: τf = k_t·i0`);
        // The gearbox can only lose: k_t ≤ k_e at the output (efficiency k_t/k_e ≤ 1).
        assert.ok(kt <= ke, `${d.id}: k_t ${kt} > k_e ${ke}`);
        // The line's slope does not depend on the supply.
        const slope = v => { const l = dcLineAt(m, v); return l.stallTorqueNm / l.noLoadRadPerSec; };
        for (const v of [6, 7.2, 9, 12]) assert.ok(Math.abs(slope(v) / (kt * ke / R) - 1) < 1e-9, `${d.id} at ${v} V`);
        // Below R·i0 the motor does not overcome its own friction.
        assert.equal(dcLineAt(m, 0.99 * R * i0).stallTorqueNm, 0, d.id);
        // Its nominal voltage is a hub family's supply.
        assert.ok(Object.values(HUB_SUPPLY_VOLTS).some(s => s.volts === V), `${d.id}: ${V} V`);
    }
});

test('the fit goes through Philo\'s 9 V no-load and stall points (every motor, from its recorded measurement)', () => {
    for (const d of MOTORS) {
        const p = d.measured.philo;
        const at9 = dcLineAt(d.motor, 9);
        assert.ok(Math.abs(rel(at9.noLoadRadPerSec / RPM, p.noLoadRpm)) < 1e-9, `${d.id}: no-load speed`);
        assert.ok(Math.abs(rel(at9.stallTorqueNm * 100, p.stallNcm)) < 1e-9, `${d.id}: stall torque`);
        assert.ok(Math.abs(rel(9 / d.motor.resistanceOhm, p.stallA)) < 1e-9, `${d.id}: stall current`);
        assert.deepEqual(fitDcModel(p), {resistanceOhm: d.motor.resistanceOhm, torqueConstantNmPerA: d.motor.torqueConstantNmPerA,
            backEmfVsPerRad: d.motor.backEmfVsPerRad, noLoadCurrentA: d.motor.noLoadCurrentA}, d.id);
    }
});

test('the SPIKE motors reproduce Philo\'s 9 V numbers within 5 %, and the hub drives them at its own supply', t => {
    for (const [id, p] of Object.entries(PHILO_9V)) {
        const d = deviceModels.get(id);
        const m = d.motor;
        const at9 = dcLineAt(m, 9);
        const got = {rpm: at9.noLoadRadPerSec / RPM, noLoadA: m.noLoadCurrentA, stallNcm: at9.stallTorqueNm * 100, stallA: 9 / m.resistanceOhm};
        for (const k of Object.keys(p)) assert.ok(Math.abs(rel(got[k], p[k])) < 0.05, `${id} ${k}: ${got[k]} vs Philo ${p[k]}`);
        // The SPIKE hub's ports supply 7.2 V; the catalogue's line is the line there.
        assert.equal(m.nominalVolts, SPIKE_PRIME_PROFILE.ports[0].supplyVolts);
        const cmd = dcMotorCommand(d, 1, 'brake', SPIKE_PRIME_PROFILE.ports[0].supplyVolts);
        assert.ok(Math.abs(cmd.torqueNm - m.stallTorqueNm) < 1e-12 && Math.abs(cmd.dampingNmsPerRad - m.stallTorqueNm / m.noLoadRadPerSec) < 1e-12);
        // On a 9 V port the same motor gives Philo's 9 V stall torque.
        assert.ok(Math.abs(dcMotorCommand(d, 1, 'brake', 9).torqueNm * 100 - p.stallNcm) < 1e-9, `${id} on 9 V`);
        t.diagnostic(`${id}: R ${m.resistanceOhm.toFixed(3)} Ω, k_t ${m.torqueConstantNmPerA.toFixed(4)} N·m/A, ` +
            `k_e ${m.backEmfVsPerRad.toFixed(4)} V·s/rad (k_t/k_e ${(m.torqueConstantNmPerA / m.backEmfVsPerRad).toFixed(2)}), ` +
            `i0 ${m.noLoadCurrentA} A, τf ${(m.frictionTorqueNm * 1000).toFixed(1)} mN·m; at ${m.nominalVolts} V: ` +
            `τs ${(m.stallTorqueNm * 100).toFixed(2)} N·cm, ω0 ${(m.noLoadRadPerSec / RPM).toFixed(1)} rpm`);
    }
});

test('the fit against Philo\'s load points: residuals reported; speed within 15 % (SPIKE: every point; others: at 9 V)', t => {
    for (const d of MOTORS) {
        const rows = d.measured.philo.loadPoints.map(([V, ncm, rpm, amps]) => {
            const fit = atLoad(d.motor, V, ncm);
            return {V, speed: rel(fit.rpm, rpm), current: rel(fit.amps, amps)};
        });
        t.diagnostic(`${d.id}: ${rows.map(r => `${r.V} V speed ${pct(r.speed)} current ${pct(r.current)}`).join('; ')}`);
        const checked = d.id.startsWith('spike-') ? rows : rows.filter(r => r.V === 9);
        assert.ok(checked.length > 0, `${d.id}: no load point checked`);
        for (const r of checked) assert.ok(Math.abs(r.speed) <= 0.15, `${d.id} at ${r.V} V: speed ${pct(r.speed)}`);
    }
});

test('LEGO\'s 7.2 V sheets: speeds within the sheets\' ±15 %; other figures within 15 % or a documented disagreement', t => {
    for (const [id, s] of Object.entries(LEGO_72V)) {
        const d = deviceModels.get(id);
        assert.equal(d.reference.lego.volts, 7.2);
        const at72 = dcLineAt(d.motor, 7.2);
        const speed = rel(at72.noLoadRadPerSec / RPM, s.rpm);
        const loadSpeed = rel(atLoad(d.motor, 7.2, s.load.ncm).rpm, s.load.rpm);
        assert.ok(Math.abs(speed) <= 0.15, `${id}: no-load ${pct(speed)}`);
        assert.ok(Math.abs(loadSpeed) <= 0.15, `${id}: ${s.load.ncm} N·cm ${pct(loadSpeed)}`);
        const others = {
            'stall torque': rel(at72.stallTorqueNm * 100, s.stallNcm),
            'stall current': rel(7.2 / d.motor.resistanceOhm, s.stallA),
            'no-load current': rel(d.motor.noLoadCurrentA, s.noLoadA)
        };
        for (const [what, x] of Object.entries(others)) {
            const listed = DISAGREE[`${id} ${what}`] === true;
            assert.equal(Math.abs(x) > 0.15, listed, `${id} ${what}: ${pct(x)} ${listed ? 'is listed as a disagreement but agrees' : 'disagrees'}`);
        }
        t.diagnostic(`${id} vs LEGO at 7.2 V: no-load speed ${pct(speed)}, ${s.load.ncm} N·cm speed ${pct(loadSpeed)}, ` +
            Object.entries(others).map(([k, x]) => `${k} ${pct(x)}`).join(', '));
    }
});

test('every motor number names its source: Philo, LEGO, Pybricks, or estimated with its method', () => {
    const TAGS = [PHILO_TAG, `derived (${PHILO_TAG}`, 'lego-sheet', 'lego-api', 'lego-catalogue', 'pybricks', 'the '];
    assert.ok(PHILO_SNAPSHOT.includes(PHILO_TAG.split('@')[1].replace(/-/g, '')), 'the tag is the snapshot\'s date');
    for (const d of MOTORS) {
        const keys = [...Object.keys(d.motor), ...(Object.keys(d.ids).length ? ['ids'] : []), ...(d.numbers ? ['numbers'] : [])];
        for (const k of keys) {
            const s = d.sources[k];
            assert.ok(s && typeof s.source === 'string' && s.source.length > 20, `${d.id}.${k}: no source`);
            const tagged = TAGS.some(tag => s.source.startsWith(tag)) && (!s.source.startsWith('the ') || s.estimated === true);
            assert.ok(tagged, `${d.id}.${k}: '${s.source.slice(0, 60)}…' names no known source`);
        }
        // Philo's tag on what is fitted to him; a starred (extrapolated) stall point says so.
        for (const k of ['resistanceOhm', 'torqueConstantNmPerA', 'backEmfVsPerRad', 'noLoadCurrentA']) {
            assert.ok(d.sources[k].source.startsWith(PHILO_TAG), `${d.id}.${k}`);
        }
        if (d.measured.philo.extrapolated) assert.match(d.sources.resistanceOhm.source, /extrapolated/, d.id);
        if (d.motor.rotorInertiaKgM2 !== undefined) assert.ok(d.sources.rotorInertiaKgM2.source.startsWith('pybricks'), d.id);
    }
});

test('the SPIKE, RCX and Powered Up motors with parts have them; LPF2 ids are unique; every part\'s device is in the catalogue', () => {
    const lpf2 = MOTORS.map(d => d.ids.lpf2).filter(x => x !== undefined);
    assert.equal(new Set(lpf2).size, lpf2.length, `${lpf2}`);
    // The Powered Up / BOOST / WeDo 2.0 motors got their LDraw parts with the LWP3 and WeDo hubs (docs/LWP3-VIRTUAL-HUB-NOTES.md).
    const PUP_PARTS = ['pup-medium-motor', 'boost-interactive-motor', 'technic-large-motor', 'technic-xl-motor'];
    const WITH_PARTS = id => id.startsWith('spike-') || id === 'technic-minimotor-71427' || PUP_PARTS.includes(id);
    for (const d of MOTORS) assert.deepEqual(d.parts.length > 0, WITH_PARTS(d.id), `${d.id}: ${d.parts}`);
    const parts = JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts;
    const motorDevices = parts.map(p => p.device).filter(id => id && deviceModels.get(id)?.class === 'motor').sort();
    assert.deepEqual(motorDevices, ['boost-interactive-motor', 'pup-medium-motor', 'spike-large-angular', 'spike-medium-angular',
        'technic-large-motor', 'technic-minimotor-71427', 'technic-xl-motor']);
    // The BOOST Move Hub's two motors are built into the hub part (internal joints actuatedBy 'built-in').
    const moveHub = parts.find(p => p.part === '26910.dat');
    assert.deepEqual(moveHub.internalJoints.filter(j => j.actuatedBy === 'built-in').map(j => [j.port, j.device]),
        [['A', 'boost-move-hub-motor'], ['B', 'boost-move-hub-motor']]);
    for (const id of motorDevices) {
        const part = parts.find(p => p.device === id);
        assert.deepEqual(deviceModels.get(id).parts, [part.part], `${id} names its part`);
    }
});
