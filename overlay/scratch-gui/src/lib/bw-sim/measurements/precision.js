// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Read-only, bounded completed-step transport and accepted-batch analysis.
export const OBSERVATION_SAMPLE_LIMIT = 600;
export const observationSelection = (value, mechanism) => {
    if (value == null) return null;
    if (!Number.isSafeInteger(value.revision) || value.revision < 1 || !Array.isArray(value.joints) ||
        value.joints.length > 4 || new Set(value.joints).size !== value.joints.length ||
        value.joints.some(id => typeof id !== 'string' || !mechanism.joints.some(j => j.id === id && ['hinge', 'slider'].includes(j.type))) ||
        typeof value.contacts !== 'boolean' || typeof value.screws !== 'boolean') throw new Error('invalid measurement observation selection');
    return {revision: value.revision, joints: value.joints.slice(), contacts: value.contacts, screws: value.screws};
};
const finite = value => typeof value === 'number' && Number.isFinite(value);
/** One collector per invocation; discarded worker attempts never reach analytical state. */
export const collectFixedObservations = (core, mechanism, selection) => {
    selection = observationSelection(selection, mechanism);
    let samples = [], overflow = false, attached = true;
    const types = new Map(mechanism.joints.map(j => [j.id, j.type]));
    const detach = selection?.joints.length && typeof core.observeFixedSteps === 'function' ? core.observeFixedSteps(step => {
        if (!attached) return;
        if (samples.length >= OBSERVATION_SAMPLE_LIMIT) { overflow = true; return; }
        const joints = selection.joints.map(id => {
            try {
                const coordinate = core.jointState(id), dynamics = core.jointDynamics?.(id);
                return {id, type: types.get(id), coordinate: types.get(id) === 'hinge' ? coordinate.angle : coordinate.position,
                    powerW: dynamics && dynamics.t === step.t && dynamics.stepSeconds === step.stepSeconds ? dynamics.motorPowerW : null};
            } catch (_) { return {id, type: types.get(id), coordinate: null, powerW: null}; }
        });
        samples.push({t: step.t, stepSeconds: step.stepSeconds, joints});
    }) : null;
    return {
        take () {
            const out = selection ? {revision: selection.revision, samples, overflow,
                unavailable: Boolean(selection.joints.length && !detach)} : null;
            samples = []; overflow = false;
            return out;
        },
        detach () { attached = false; detach?.(); samples = []; }
    };
};

/** Signed work uses the native completed-step power sum; zero-crossings use linear
 * localization within adjacent fixed-step observations, not a physical substep claim.
 * The first selected hinge is the phase reference. No retained unbounded trace.
 */
export const createPrecisionAnalysis = selection => {
    const states = new Map((selection?.joints || []).map(id => [id, {id, type: null, previous: null, crossing: null,
        periodSeconds: null, workJ: 0, workComplete: true}]));
    let lastTime = null, gap = false;
    const invalidate = () => {
        gap = true; lastTime = null;
        for (const state of states.values()) Object.assign(state, {previous: null, crossing: null, periodSeconds: null, workComplete: false});
    };
    return {
        accept (packet) {
            if (!selection || packet?.revision !== selection.revision) return false;
            if (!Array.isArray(packet.samples) || packet.samples.length > OBSERVATION_SAMPLE_LIMIT || packet.overflow || packet.unavailable) {
                invalidate(); return true;
            }
            for (const sample of packet.samples) {
                if (!finite(sample?.t) || !finite(sample.stepSeconds) || sample.stepSeconds <= 0 ||
                    !Array.isArray(sample.joints) || sample.joints.length !== states.size ||
                    new Set(sample.joints.map(j => j.id)).size !== states.size || sample.joints.some(j => !states.has(j.id)) ||
                    lastTime !== null && Math.abs(sample.t - lastTime - sample.stepSeconds) > 1e-8) {
                    invalidate(); continue;
                }
                lastTime = sample.t;
                for (const observed of sample.joints) {
                    const state = states.get(observed.id);
                    if (!['hinge', 'slider'].includes(observed.type) || !finite(observed.coordinate)) {
                        Object.assign(state, {previous: null, crossing: null, periodSeconds: null, workComplete: false}); gap = true; continue;
                    }
                    state.type = observed.type;
                    if (finite(observed.powerW)) state.workJ += observed.powerW * sample.stepSeconds;
                    else { state.workComplete = false; gap = true; }
                    const previous = state.previous;
                    if (observed.type === 'hinge' && previous && previous.value < 0 && observed.coordinate >= 0) {
                        const crossing = previous.t + (sample.t - previous.t) * -previous.value / (observed.coordinate - previous.value);
                        if (state.crossing !== null) state.periodSeconds = crossing - state.crossing;
                        state.crossing = crossing;
                    }
                    state.previous = {t: sample.t, value: observed.coordinate};
                }
            }
            return true;
        },
        snapshot () {
            const reference = [...states.values()].find(s => s.type === 'hinge');
            return {revision: selection?.revision || null, gap, referenceJoint: reference?.id || null,
                method: 'completed-fixed-step; rising angle-zero crossings; signed sum(power × step)',
                rows: [...states.values()].map(state => {
                    const phase = state.crossing !== null && reference?.crossing !== null && reference?.periodSeconds > 0 ?
                        (((state.crossing - reference.crossing) / reference.periodSeconds * 360 + 180) % 360 + 360) % 360 - 180 : null;
                    return {joint: state.id, type: state.type, periodSeconds: state.periodSeconds,
                        phaseDegrees: phase, workJ: state.workComplete && state.type ? state.workJ : null};
                })};
        }
    };
};
