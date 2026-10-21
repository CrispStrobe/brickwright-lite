// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Air (kinds/pneumatic.js, docs/ROBOT-LAB-UX.md §16): the core's side of pneumatics. Each air
// network holds an amount of air n = p·V (absolute kPa × m³). Before each step:
//   - a pump pushed in by d puts the air it sweeps (P_ATM·A·d) into its network, up to PUMP_MAX_KPA,
//     and the network's pressure pushes its piston back (p·A, while it goes in);
//   - a valve's lever angle (from where the model had it) opens its supply to outlet A or B, or shuts;
//   - a cylinder the open outlet feeds moves at its flow's speed with at most p·A (its slider's
//     velocity motor), and the air it takes, (p + P_ATM)·A per metre, leaves the network; a shut valve
//     holds the rod. A valve with no supply hose is fed ideally (forceN, nothing used up: v1).

import {PUMP_MAX_KPA, VALVE_DEG} from '../kinds/pneumatic.js';

/** The air's own pressure (kPa): networks hold at least this much (a gauge pressure of 0). */
export const P_ATM_KPA = 101.325;
/** A shut valve holds its cylinder's rod with up to this (N): the air in it does not give. */
const HOLD_FORCE_N = 40;
/** A slider's travel smaller than this (m) in a step is no travel (the solver's jitter). */
const STILL_M = 1e-7;

const rotate = (q, v) => {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
};

/**
 * @param {{J, cylinders: object[], pumps: object[], hingeMap: Map, sliderMap: Map, bodyInterface, applySliderForce: Function}} args
 *   cylinders: 'pneumatic' couplings; pumps: 'pump' couplings (kinds/pneumatic.js).
 */
export const createAir = ({J, cylinders, pumps, hingeMap, sliderMap, bodyInterface, applySliderForce}) => {
    const networks = new Map();
    const netOf = spec => {
        if (!spec) return null;
        if (!networks.has(spec.id)) networks.set(spec.id, {id: spec.id, volumeM3: spec.volumeM3, n: (spec.startKpa + P_ATM_KPA) * spec.volumeM3});
        return networks.get(spec.id);
    };
    const kpa = net => net.n / net.volumeM3 - P_ATM_KPA;
    const valves = cylinders.map(c => {
        const valve = hingeMap.get(c.valveJoint);
        const slider = sliderMap.get(c.sliderJoint);
        if (!valve || !slider) throw new Error(`pneumatic ${c.id}: its valve hinge and cylinder slider must exist`);
        slider.mode = 'pneumatic';
        return {c, valve, slider, net: netOf(c.network), theta0: valve.unwrapped, prev: slider.slider.GetCurrentPosition(), state: null};
    });
    const pumpers = pumps.map(c => {
        const slider = sliderMap.get(c.sliderJoint);
        if (!slider) throw new Error(`pump ${c.id}: its slider must exist`);
        return {c, slider, net: netOf(c.network), prev: slider.slider.GetCurrentPosition(), pumping: false};
    });
    const forceVec = new J.Vec3(0, 0, 0);
    /** A force f (N) along the slider's axis on its coordinate: +f on body2, −f on body1. */
    const pushSlider = (entry, f) => {
        const rot = bodyInterface.GetRotation(entry.bodyAID);
        const ax = rotate([rot.GetX(), rot.GetY(), rot.GetZ(), rot.GetW()], entry.localAxis1);
        forceVec.Set(ax[0] * f, ax[1] * f, ax[2] * f);
        bodyInterface.AddForce(entry.bodyBID, forceVec, J.EActivation_Activate);
        forceVec.Set(-ax[0] * f, -ax[1] * f, -ax[2] * f);
        bodyInterface.AddForce(entry.bodyAID, forceVec, J.EActivation_Activate);
    };

    const beforeStep = () => {
        for (const p of pumpers) {
            const pos = p.slider.slider.GetCurrentPosition();
            const dIn = p.c.inSign * (pos - p.prev);
            p.prev = pos;
            p.pumping = dIn > STILL_M;
            if (!p.pumping) continue;
            const pressure = kpa(p.net);
            if (pressure < PUMP_MAX_KPA) p.net.n += P_ATM_KPA * p.c.areaM2 * dIn;
            // The air pushes back on the piston while it goes in.
            if (pressure > 0) pushSlider(p.slider, -p.c.inSign * pressure * 1000 * p.c.areaM2);
        }
        for (const d of valves) {
            const deg = d.c.valveSign * (d.valve.unwrapped - d.theta0) * 180 / Math.PI;
            const open = deg > VALVE_DEG ? 'outA' : deg < -VALVE_DEG ? 'outB' : null;
            // Which way the rod goes: out when the open outlet feeds the extend port, in when the retract one.
            const way = open && open === d.c.extendFrom ? 1 : open && open === d.c.retractFrom ? -1 : 0;
            const pos = d.slider.slider.GetCurrentPosition();
            const moved = way * d.c.outSign * (pos - d.prev);
            d.prev = pos;
            // The air the rod took last step (the chamber it filled), from the network.
            if (d.net && way && moved > STILL_M) {
                d.net.n = Math.max(P_ATM_KPA * d.net.volumeM3, d.net.n - (kpa(d.net) + P_ATM_KPA) * d.c.areaM2 * moved);
            }
            const force = !way ? HOLD_FORCE_N : d.net ? Math.max(0, kpa(d.net)) * 1000 * d.c.areaM2 : d.c.forceN;
            d.state = way > 0 ? 'out' : way < 0 ? 'in' : 'held';
            applySliderForce(d.slider, force);
            d.slider.slider.SetMotorState(J.EMotorState_Velocity);
            d.slider.slider.SetTargetVelocity(way * d.c.outSign * d.c.speedMPerS);
        }
    };

    return {
        count: valves.length + pumpers.length,
        beforeStep,
        /** Each cylinder's state: 'out', 'in' or 'held'. */
        cylinders: () => valves.map(d => ({slider: d.c.sliderJoint, state: d.state || 'held'})),
        /** Each network's pressure (kPa above the air's). */
        networks: () => [...networks.values()].map(n => ({id: n.id, kPa: kpa(n)})),
        registrant: {
            save: () => [[...networks.values()].map(n => n.n), valves.map(d => [d.theta0, d.prev]), pumpers.map(p => p.prev)],
            restore: ([nets, vs, ps]) => {
                [...networks.values()].forEach((n, i) => { n.n = nets[i]; });
                valves.forEach((d, i) => { [d.theta0, d.prev] = vs[i]; d.state = null; });
                pumpers.forEach((p, i) => { p.prev = ps[i]; });
            }
        }
    };
};

