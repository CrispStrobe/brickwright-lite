// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeAddon} from './sim-lab-addon-judge.mjs';
import {judgeTipline, measureTipline} from './sim-lab-tipline-judge.mjs';
import {judgeTwistspan, evaluateTwistspan} from './sim-lab-twistspan-judge.mjs';
import {judgeSwayShiftRun} from './sim-lab-swayshift-judge.mjs';

export const BATCH_E_CONTRACTS = Object.freeze(Object.fromEntries(
    ['tipline', 'twistspan', 'swayshift'].map(id => [id, JSON.parse(readFileSync(
        new URL('../../docs/data/robot-lab-contracts/' + id + '.json', import.meta.url)))])));

// Relative geometry cannot conceal a translated world. These bounds are the
// original two-millimetre foundation envelope, measured from actual body poses.
function stationaryChassis(record) {
    const base = observeAddon(record).base.id;
    const initial = record.track[0].bodies[base].position;
    assert.ok(record.track.every(frame => Math.hypot(...frame.bodies[base].position
        .map((value, i) => value - initial[i])) <= .002), 'stationary chassis');
}
export function judgePromotionTipline(record) {
    stationaryChassis(record);
    const result = judgeTipline(record, {variant: 'main', contract: BATCH_E_CONTRACTS.tipline});
    return result.summary;
}
export function judgePromotionTwistspan(record) {
    stationaryChassis(record);
    const result = judgeTwistspan(record, {variant: 'outer', contract: BATCH_E_CONTRACTS.twistspan});
    return result.summary;
}
export function judgePromotionSwayShift(record) {
    stationaryChassis(record);
    const result = judgeSwayShiftRun(record, {mode: 'tuned', contract: BATCH_E_CONTRACTS.swayshift});
    assert.ok(result.passed, JSON.stringify(result.gates.filter(gate => !gate.passed)));
    const m = result.measurements;
    return {periodSeconds: m.periodSeconds, timing: m.timing, travel: m.travel,
        primaryRmsDeg: m.primary.rmsDeg, secondaryRmsDeg: m.secondary.rmsDeg};
}

export function batchEDisconnectionLoss(id, record) {
    if (id === 'tipline') {
        const c = BATCH_E_CONTRACTS.tipline;
        const s = measureTipline(record, {variant: 'main', contract: c}).summary;
        return {lost: s.topArrivalErrorDeg > c.nativeGates.deckTopArrivalErrorDegMax,
            value: s.topArrivalErrorDeg, metric: 'actual deck arrival error in degrees'};
    }
    if (id === 'twistspan') {
        const result = evaluateTwistspan(record, {variant: 'outer', contract: BATCH_E_CONTRACTS.twistspan});
        const physical = result.gates.filter(gate => ['period_relative_error', 'measured_output_cycles',
            'passive_yaw_peak_to_peak_deg'].includes(gate.name));
        assert.equal(physical.length, 3);
        return {lost: physical.some(gate => !gate.passed), value: result.summary.measuredPeriodSeconds,
            metric: 'measured passive period, cycles and amplitude', physical};
    }
    assert.equal(id, 'swayshift');
    const c = BATCH_E_CONTRACTS.swayshift, o = observeAddon(record);
    const initial = o.point(record.track[0], 'rack');
    const travel = Math.max(...record.track.map(frame => Math.hypot(...o.point(frame, 'rack')
        .map((value, i) => value - initial[i])) * 1000));
    return {lost: travel < c.geometry.totalTravelMm - c.gates.totalTravelErrorMmMaxAbs,
        value: travel, metric: 'actual carriage travel in millimetres'};
}
