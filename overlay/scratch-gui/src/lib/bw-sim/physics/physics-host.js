// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Pure message handler for the physics worker. No globals, no DOM.
// The host is created with {loadJolt, createPhysicsCore, post} and
// exposes handle(msg) which processes messages strictly in order via
// an internal promise chain. See task P2 for message types.

/**
 * Create a physics host.
 * @param {object} opts
 * @param {() => Promise<any>} opts.loadJolt - async Jolt loader
 * @param {(J: any, mechanism: any, opts?: any) => any} opts.createPhysicsCore - core factory
 * @param {(msg: any, transfer?: Transferable[]) => void} opts.post - reply sender
 * @returns {{handle: (msg: any) => Promise<void>}}
 */
export const createPhysicsHost = ({ loadJolt, createPhysicsCore, post }) => {
    let J = null;
    let core = null;
    let lastMechanism = null;
    let lastStepHz = 120;
    let chain = Promise.resolve();

    const ensureJolt = async () => {
        if (!J) J = await loadJolt();
        return J;
    };

    const doHandle = async msg => {
        try {
            if (!msg || typeof msg.type !== 'string') {
                post({ type: 'error', id: msg?.id ?? null, message: 'unknown message type' });
                return;
            }
            switch (msg.type) {
                case 'load': {
                    const { id, mechanism, stepHz } = msg;
                    try {
                        if (core) {
                            try { core.destroy(); } catch (_) {}
                            core = null;
                        }
                        const jolt = await ensureJolt();
                        const hz = typeof stepHz === 'number' && Number.isFinite(stepHz) ? stepHz : 120;
                        const c = createPhysicsCore(jolt, mechanism, { stepHz: hz });
                        core = c;
                        lastMechanism = mechanism;
                        lastStepHz = hz;
                        const bodyIds = mechanism.bodies.map(b => b.id);
                        const jointIds = mechanism.joints.map(j => j.id);
                        post({ type: 'loaded', id, bodyIds, jointIds });
                    } catch (err) {
                        post({ type: 'error', id, message: err.message ?? String(err) });
                    }
                    break;
                }
                case 'step': {
                    const { id, dtSeconds, motors } = msg;
                    if (!core) {
                        post({ type: 'error', id, message: 'step before load' });
                        break;
                    }
                    try {
                        if (Array.isArray(motors)) {
                            for (const m of motors) {
                                if (!m || typeof m.joint !== 'string' || !m.cmd) continue;
                                core.setMotor(m.joint, m.cmd);
                            }
                        }
                        core.step(dtSeconds);
                        const snap = core.snapshot();
                        post({ type: 'snapshot', id, t: snap.t, bodies: snap.bodies, joints: snap.joints }, [snap.bodies.buffer, snap.joints.buffer]);
                    } catch (err) {
                        post({ type: 'error', id, message: err.message ?? String(err) });
                    }
                    break;
                }
                case 'reset': {
                    const { id } = msg;
                    try {
                        if (!lastMechanism) {
                            post({ type: 'error', id, message: 'reset before load' });
                            break;
                        }
                        if (core) {
                            try { core.destroy(); } catch (_) {}
                            core = null;
                        }
                        const jolt = await ensureJolt();
                        const c = createPhysicsCore(jolt, lastMechanism, { stepHz: lastStepHz });
                        core = c;
                        const bodyIds = lastMechanism.bodies.map(b => b.id);
                        const jointIds = lastMechanism.joints.map(j => j.id);
                        post({ type: 'loaded', id, bodyIds, jointIds });
                    } catch (err) {
                        post({ type: 'error', id, message: err.message ?? String(err) });
                    }
                    break;
                }
                case 'dispose': {
                    const { id } = msg;
                    try {
                        if (core) {
                            try { core.destroy(); } catch (_) {}
                            core = null;
                        }
                        lastMechanism = null;
                        post({ type: 'disposed', id });
                    } catch (err) {
                        post({ type: 'error', id, message: err.message ?? String(err) });
                    }
                    break;
                }
                default: {
                    post({ type: 'error', id: msg.id ?? null, message: `unknown message type: ${msg.type}` });
                    break;
                }
            }
        } catch (err) {
            try {
                post({ type: 'error', id: msg?.id ?? null, message: err.message ?? String(err) });
            } catch (_) {}
        }
    };

    return {
        handle(msg) {
            const p = chain.then(() => doHandle(msg));
            chain = p.catch(() => {});
            return p;
        },
    };
};
