export const validateSoundTabReceipt = receipt => {
    const failures = [];
    const finite = (value, label, {positive = false, nonnegative = false} = {}) => {
        if (!Number.isFinite(value) || (positive && value <= 0) || (nonnegative && value < 0)) {
            failures.push(`${label} is missing or invalid`);
            return false;
        }
        return true;
    };
    if (!receipt || typeof receipt !== 'object') return ['receipt is missing or invalid'];
    if (!Array.isArray(receipt.errors)) failures.push('page errors are missing or invalid');
    else if (receipt.errors.length) failures.push(receipt.errors.join(' | '));
    if (receipt.diagnosticError) failures.push(`diagnostics: ${receipt.diagnosticError}`);
    if (receipt.failure) failures.push(`${receipt.failure.stage}: ${receipt.failure.message}`);
    if (receipt.loadError) failures.push(receipt.loadError);
    if (!receipt.tab?.visible || !receipt.tab?.exactName) failures.push('visible exact Sound tab was not bound');
    if (!receipt.panel?.id || receipt.panel.id !== receipt.tab.ariaControls) {
        failures.push('Sound tab aria-controls did not bind its measured panel');
    }
    if (!receipt.panel?.selected || !Number.isInteger(receipt.panel.soundControls) ||
        receipt.panel.soundControls < 3) {
        failures.push(`Sound panel was not usable: selected=${Boolean(receipt.panel?.selected)}, ` +
            `controls=${receipt.panel?.soundControls || 0}`);
    }
    const durationValid = finite(receipt.durationMs, 'durationMs', {nonnegative: true});
    const relativeValid = finite(receipt.relativeLimitMs, 'relativeLimitMs', {positive: true});
    const absoluteValid = finite(receipt.absoluteLimitMs, 'absoluteLimitMs', {positive: true});
    const taskLimitValid = finite(receipt.maxLongTaskMs, 'maxLongTaskMs', {positive: true});
    const minimumValid = finite(receipt.minimumEncodedBytes, 'minimumEncodedBytes', {positive: true});
    if (durationValid && relativeValid && absoluteValid &&
        (receipt.durationMs > receipt.relativeLimitMs || receipt.durationMs > receipt.absoluteLimitMs)) {
        failures.push(`Sounds tab took ${receipt.durationMs} ms; limits are ` +
            `${receipt.relativeLimitMs} / ${receipt.absoluteLimitMs} ms`);
    }
    if (!Array.isArray(receipt.longTasks) || receipt.longTasks.some(task =>
        !Number.isFinite(task?.ms) || task.ms < 0)) {
        failures.push('long-task measurements are missing or invalid');
    } else if (taskLimitValid) {
        const longest = Math.max(0, ...receipt.longTasks.map(task => task.ms));
        if (longest > receipt.maxLongTaskMs) failures.push(`Sounds tab added a ${longest} ms long task`);
    }
    if (!Array.isArray(receipt.scripts) || receipt.scripts.some(script =>
        typeof script?.name !== 'string' || !Number.isFinite(script?.encodedBodySize) ||
        script.encodedBodySize < 0)) {
        failures.push('causal scripts are missing or invalid');
    }
    if (!Array.isArray(receipt.soundTabScripts) || receipt.soundTabScripts.length !== 1) {
        failures.push(`expected one named sound-tab script, got ${receipt.soundTabScripts?.length ?? 'invalid'}`);
    } else if (!Number.isFinite(receipt.soundTabScripts[0]?.encodedBodySize) ||
        receipt.soundTabScripts[0].encodedBodySize < 0) {
        failures.push('named sound-tab encoded size is missing or invalid');
    } else if (minimumValid && receipt.soundTabScripts[0].encodedBodySize < receipt.minimumEncodedBytes) {
        failures.push(`sound-tab moved only ${receipt.soundTabScripts[0].encodedBodySize} encoded bytes`);
    }
    finite(receipt.causalEncodedBytes, 'causalEncodedBytes', {nonnegative: true});
    return failures;
};
