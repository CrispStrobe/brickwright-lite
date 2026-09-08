// Serializable into a browser page: deliberately has no module dependencies.
// This measures the production target, not React/paint throughput. The paced
// browser receipt continues to measure those separately.
export function measureUnpacedTarget({guestNs = 1_000_000_000, repetitions = 5} = {}) {
    const target = window.__benchTarget;
    if (!target || target.state() !== 'running') throw new Error('No running production target');
    const heartbeat = () => {
        const r = target.regs();
        const bytes = target.readMem('mem', (r.ds << 4) + 0x110, 4);
        return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
    };
    const samples = [];
    for (let i = 0; i <= repetitions; i++) {
        const beforeHeartbeat = heartbeat();
        const before = target.timeNs();
        const started = performance.now();
        const outcome = target.runFor(guestNs);
        const wallMs = performance.now() - started;
        const advancedNs = Number(target.timeNs() - before);
        const heartbeatDelta = (heartbeat() - beforeHeartbeat) >>> 0;
        if (outcome !== 'budget' || target.state() !== 'running' ||
            advancedNs < guestNs || !heartbeatDelta || !(wallMs > 0)) {
            throw new Error('Unpaced production target did not execute the workload');
        }
        if (i) samples.push({wallMs, advancedNs, heartbeatDelta,
            realTimeRatio: advancedNs / 1e6 / wallMs});
    }
    return {scope: 'production target; no frame pacing, rendering or setup in timing',
        guestNs, repetitions, samples};
}
