// Compatibility tombstone, not an executable optimization. The old deferred
// implementation violated public counter observability. History and the engine
// negative fixture preserve the finding without leaving a broken path enabled
// by an old script or saved command.
export function createPitSchedulingExperiment() {
    throw new Error('PIT scheduling experiment removed: deferred public counter state violates instruction-boundary observability');
}
