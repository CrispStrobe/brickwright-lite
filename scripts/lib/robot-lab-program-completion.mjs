// SPDX-License-Identifier: BSD-3-Clause
// Completion is stricter than a finite smoke run. Unreviewed output contracts stay gaps.
export const PROGRAM_OUTPUT_CONTRACTS = {
    'toggle-lever': {terminal: 'completed', part: 'jaw_lever', description: 'Passive jaw lever arc and return to saved pose', minTravelM: 0.001, drive: 'commanded-motion', terminalValues: {stage: 4}, message: 'ToggleLever complete: compare the passive lever arc with the link closure.'},
    pointweaver: {terminal: 'done', part: 'endpoint_marker', relativeTo: 'base_cross_-40', description: 'Five-bar endpoint loop and return to saved pose', minTravelM: 0.001, drive: 'commanded-motion', terminalValues: {phase: 99}, message: 'PointWeaver loop complete. Compare the dashed straight edges with the endpoint path, then reset before repeating.'}
};
// Ask the product API for the authored measurement point. A nearby marker tip can
// rotate about that point, so its path cannot substitute for the named origin.
export function readOutputPose(api, contract) {
    const reading=api?.pose(contract.part), reference=contract.relativeTo ? api?.pose(contract.relativeTo) : null;
    const valid=r=>r?.ok && Array.isArray(r.position) && r.position.length===3 && r.position.every(Number.isFinite) && Array.isArray(r.quat) && r.quat.length===4 && r.quat.every(Number.isFinite);
    if(!valid(reading) || (contract.relativeTo && !valid(reference))) return null;
    return {...reading, position:reading.position.map((v,i)=>v-(reference?.position[i]||0))};
}
export function observeTerminal(state, variables, name) {
    if (!name) return;
    if (Number(variables[name]) === 0) state.sawZero = true;
    if (state.sawZero && Number(variables[name]) === 1) state.sawTransition = true;
}
export function programCompletion(report, contract) {
    const gaps = [];
    if (!contract) gaps.push('OUTPUT_CONTRACT_UNREVIEWED');
    if (report.execution !== 'COMPLETED') gaps.push('PROGRAM_DID_NOT_EXIT');
    if (contract && (!report.terminalObservation?.sawTransition || Number(report.programVariables?.[contract.terminal]) !== 1)) gaps.push('TERMINAL_FLAG_NOT_REACHED');
    if (contract?.drive === 'commanded-motion' && !Object.values(report.motors || {}).some(m => m.commanded && m.moved)) gaps.push('PRIMARY_DRIVE_MOVEMENT_UNVERIFIED');
    const output = report.outputMeasurement;
    if (contract && (!output || output.samples < 2 || output.invalid || !Number.isFinite(output.travelM) || output.travelM < contract.minTravelM)) gaps.push('MEANINGFUL_OUTPUT_NOT_OBSERVED');
    if (contract?.outputReviewPending) gaps.push('OUTPUT_GEOMETRY_REVIEW_PENDING');
    for (const [name, value] of Object.entries(contract?.terminalValues || {})) if (Number(report.programVariables?.[name]) !== value) gaps.push('TERMINAL_STAGE_NOT_REACHED:' + name);
    if (contract?.message && !report.messages?.includes(contract.message)) gaps.push('TERMINAL_MESSAGE_UNVERIFIED');
    const faults = [...(report.failures || [])];
    return {status: faults.length ? 'FAIL' : gaps.length ? 'PARTIAL' : 'COMPLETE', gaps, failures: faults};
}
