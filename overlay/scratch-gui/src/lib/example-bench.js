export const normalizeDeviceId = id => String(id || '').trim().toLowerCase().replace(/_/g, '-');

// These targets deliberately have no Circuit-tab bench. Their board face and
// inputs live in the simulator/controller pane, so retargeting a program to
// one of them must not be rejected for lacking a circuit.json file.
export const SIMULATOR_ONLY_DEVICES = new Set(['microbit', 'calliopemini']);

/**
 * Resolve the circuit that belongs with a program target. Retargeting is an
 * atomic program+bench operation: returning the authored circuit for a newly
 * retargeted program would create a visually plausible but electrically false
 * project, so a missing generated bench is an explicit refusal.
 */
export const resolveExampleBench = (example, targetDevice, authoredDevice, override) => {
    const target = normalizeDeviceId(targetDevice);
    const authored = normalizeDeviceId(authoredDevice);
    const authoredPath = example && example.files && example.files.circuit;
    const retargeted = Boolean(target && authored && target !== authored);
    if (!retargeted) return {path: authoredPath || null, retargeted: false};
    if (SIMULATOR_ONLY_DEVICES.has(target)) return {path: null, retargeted: true};

    const entries = Object.entries((example && example.benches) || {});
    const indexed = entries.find(([device]) => normalizeDeviceId(device) === target);
    const path = override || (indexed && indexed[1]) || null;
    if (path) return {path, retargeted: true};
    return {
        path: null,
        retargeted: true,
        error: `cannot retarget ${example && example.id ? `"${example.id}" ` : ''}to ${target}: ` +
            'the matching circuit bench is not available'
    };
};
