const finite = (value, {positive = false, nonnegative = false} = {}) =>
    Number.isFinite(value) && (!positive || value > 0) && (!nonnegative || value >= 0);

export const validatePseudocodeActivationReceipt = receipt => {
    const failures = [];
    if (!receipt || typeof receipt !== 'object') return ['receipt is missing or invalid'];
    if (receipt.schema !== 'brickwright/p21-pseudocode-activation/v1') failures.push('receipt schema is invalid');
    if (receipt.mode !== 'eager-baseline' && receipt.mode !== 'lazy-candidate') failures.push('receipt mode is invalid');
    if (!Number.isSafeInteger(receipt.run) || receipt.run <= 0) failures.push('hosted run is invalid');
    if (!/^[0-9a-f]{40}$/.test(receipt.headSha || '')) failures.push('hosted commit is invalid');
    if (!finite(receipt.absoluteLimitMs, {positive: true})) failures.push('absoluteLimitMs is invalid');
    if (!finite(receipt.maxLongTaskMs, {positive: true})) failures.push('maxLongTaskMs is invalid');
    if (!Array.isArray(receipt.samples) || receipt.samples.length !== 5) {
        failures.push(`expected five cold samples, got ${receipt.samples?.length ?? 'invalid'}`);
        return failures;
    }
    for (const [index, sample] of receipt.samples.entries()) {
        const label = `sample ${index + 1}`;
        if (sample.failure) failures.push(`${label} ${sample.failure.stage}: ${sample.failure.message}`);
        if (!Array.isArray(sample.errors)) failures.push(`${label} page errors are invalid`);
        else if (sample.errors.length) failures.push(`${label} page errors: ${sample.errors.join(' | ')}`);
        if (!sample.tab?.visible || !sample.tab?.exactName || !sample.tab?.ariaControls) {
            failures.push(`${label} did not bind the exact visible Code tab`);
        }
        if (!sample.panel?.selected || sample.panel.id !== sample.tab?.ariaControls) {
            failures.push(`${label} did not bind the selected Code panel`);
        }
        if (!['textarea', 'codemirror'].includes(sample.editorKind)) {
            failures.push(`${label} did not reach an editable Code surface`);
        }
        if (!finite(sample.durationMs, {nonnegative: true})) failures.push(`${label} durationMs is invalid`);
        else if (finite(receipt.absoluteLimitMs, {positive: true}) && sample.durationMs > receipt.absoluteLimitMs) {
            failures.push(`${label} took ${sample.durationMs} ms; limit is ${receipt.absoluteLimitMs} ms`);
        }
        if (!Array.isArray(sample.longTasks) || sample.longTasks.some(task =>
            !finite(task?.ms, {nonnegative: true}))) {
            failures.push(`${label} long-task measurements are invalid`);
        } else if (finite(receipt.maxLongTaskMs, {positive: true}) &&
            Math.max(0, ...sample.longTasks.map(task => task.ms)) > receipt.maxLongTaskMs) {
            failures.push(`${label} exceeded the ${receipt.maxLongTaskMs} ms long-task limit`);
        }
        if (!Array.isArray(sample.pseudocodeScripts) || sample.pseudocodeScripts.some(script =>
            typeof script?.name !== 'string' || !finite(script?.encodedBodySize, {nonnegative: true}))) {
            failures.push(`${label} pseudocode script measurements are invalid`);
        } else if (receipt.mode === 'eager-baseline' && sample.pseudocodeScripts.length) {
            failures.push(`${label} eager baseline unexpectedly fetched a pseudocode-importer chunk`);
        }
    }
    if (!finite(receipt.medianMs, {nonnegative: true})) failures.push('medianMs is invalid');
    else {
        const sorted = receipt.samples.map(sample => sample.durationMs).slice().sort((a, b) => a - b);
        if (sorted[2] !== receipt.medianMs) failures.push('medianMs does not match the five samples');
    }
    return failures;
};
