// SPDX-License-Identifier: BSD-3-Clause
// Functional smoke observations, deliberately independent of precision judges.
export function nonFinitePaths(value, path = '', out = []) {
    if (typeof value === 'number' && !Number.isFinite(value)) out.push(path);
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) nonFinitePaths(child, `${path}/${key}`, out);
    return out;
}
export function summarizeMotor(samples) {
    const positions = samples.map(s => s.position);
    const finite = positions.length > 1 && positions.every(Number.isFinite);
    const travelDeg = finite ? Math.max(...positions) - Math.min(...positions) : null;
    const commanded = samples.some(s => !['idle', 'coast', 'brake', 'hold', undefined].includes(s.mode));
    return {samples: samples.length, commanded, travelDeg, moved: finite && travelDeg >= 0.1,
        status: !finite ? 'NONFINITE_OR_NO_OBSERVATIONS' : travelDeg >= 0.1 ? 'MOVED' : commanded ? 'COMMANDED_STATIONARY' : 'UNCOMMANDED_STATIONARY'};
}
export function functionalFailures(report) {
    return [
        ...report.partFailures.map(x => `unresolved-part:${x}`),
        ...report.compileErrors.map(x => `compile:${x}`),
        ...report.vmErrors.map(x => `vm:${x}`),
        ...report.nonfinite.map(x => `nonfinite:${x}`),
        ...report.sessionFailures.map(x => `session:${x}`),
        ...report.missingOpcodes.map(x => `opcode:${x}`),
        ...Object.entries(report.motors).filter(([,m]) => !m.moved).map(([p,m]) => `motor:${p}:${m.status}`),
        ...(report.steps > 0 ? [] : ['no-vm-steps'])
    ];
}
