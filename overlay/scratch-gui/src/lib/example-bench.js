export const normalizeDeviceId = id => String(id || '').trim().toLowerCase().replace(/_/g, '-');

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
