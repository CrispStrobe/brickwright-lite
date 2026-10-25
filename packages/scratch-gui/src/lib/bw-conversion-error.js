/** VM validation may reject with a serialized object rather than an Error. */
export const conversionFailure = error => {
    let value = error;
    if (typeof value === 'string') {
        try { const decoded = JSON.parse(value); if (decoded && typeof decoded === 'object') value = decoded; } catch { /* plain message */ }
    }
    const details = value?.sb3Errors?.length ? value.sb3Errors : value?.sb2Errors;
    if (value?.validationError && Array.isArray(details)) {
        const issues = details.map(detail => {
            const location = detail.instancePath || detail.dataPath || 'project';
            return `${location}: ${detail.message || detail.keyword || 'invalid value'}`;
        });
        return {message: [value.validationError, ...issues].join('\n'), issues: issues.length ? issues : [value.validationError]};
    }
    let message = typeof value === 'string' ? value : value?.message;
    if (!message) {
        try { message = JSON.stringify(value); } catch { /* cyclic exception object */ }
    }
    if (!message) message = 'The conversion failed without an error message.';
    return {message: String(message), issues: [String(message)]};
};
