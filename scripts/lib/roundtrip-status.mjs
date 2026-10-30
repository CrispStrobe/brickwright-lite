/** One definition of a round-trip path's outcome, shared by the harness and
 * its public summary. `binaryAssetsNotRepresented` says the plain-text hop
 * cannot carry binary artwork, so the comparison covered structure only. That
 * is a limit of the measurement, not a measured loss: with no differences and
 * no unsupported element it is reported apart from `loss`.
 */
export const BINARY_NOT_COMPARED = 'preserved-structure, binary assets not compared';

/** Structure only: no compile state. This is the `structuralRoundtrip` qualification. */
export function structuralOutcome (path, row = {}) {
    if (path.error) return 'failed';
    if (Object.values(path.differences || {}).some(v => v.length)) return 'loss';
    if (row.importUnsupported?.length || path.exportUnsupported?.length || path.importUnsupported?.length) return 'partial';
    return path.binaryAssetsNotRepresented ? BINARY_NOT_COMPARED : 'preserved';
}

/** Tally key: a failed or invalid recompile outranks the structural outcome. */
export function pathOutcome (path, row = {}) {
    if (path.error) return 'failed';
    if (path.compile?.status === 'fail') return 'compile-failed';
    if (path.compile?.status === 'source-invalid') return 'source-invalid';
    return structuralOutcome(path, row);
}
