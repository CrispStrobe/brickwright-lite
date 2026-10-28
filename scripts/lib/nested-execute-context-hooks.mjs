// Scratch reuses one BlockUtility. A synchronous nested thread must restore
// that shared utility before its caller's remaining cached operations run.
export function patchNestedExecuteContext(source) {
    const marker = '// Brickwright: restore the shared utility after synchronous nested execution.';
    if (source.includes(marker)) return source;
    const anchor = 'module.exports = execute;';
    if (source.split(anchor).length !== 2) throw new Error('execute.js nested context export anchor missing or ambiguous');
    return source.replace(anchor, `${marker}
let executing = false;
module.exports = function executeWithContext (sequencer, thread) {
    const nested = executing;
    const previousSequencer = blockUtility.sequencer;
    const previousThread = blockUtility.thread;
    executing = true;
    try {
        return execute(sequencer, thread);
    } finally {
        executing = nested;
        if (nested) {
            blockUtility.sequencer = previousSequencer;
            blockUtility.thread = previousThread;
        }
    }
};`);
}
