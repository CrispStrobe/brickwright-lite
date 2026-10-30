/** One definition of a round-trip path's outcome, shared by the harness and
 * its public summary. `binaryAssetsNotRepresented` says the plain-text hop
 * cannot carry binary artwork, so the comparison covered structure only. That
 * is a limit of the measurement, not a measured loss: with no differences and
 * no unsupported element it is reported apart from `loss`.
 */
export const BINARY_NOT_COMPARED = 'preserved-structure, binary assets not compared';

/** Structure equal apart from importer scaffolding that the exporter, by design, does not
 * write back (see classifyNormalization). Counted apart from `preserved` and from `loss`. */
export const NORMALIZED = 'normalized';

const SCAFFOLD_HATS = new Set(['event_whenflagclicked', 'arcade_whenSourceStarts']);
const SOURCE_DECLARATIONS = new Set(['arcade_declareSourceScalar', 'arcade_declareSourceReference']);

/** `hide` blocks the importer writes as the first statement of a start script (it hides the
 * Scratch cat on a host or an artwork carrier). They are not program statements. */
export function scaffoldHideCount (project) {
    let count = 0;
    for (const target of project?.targets || []) {
        const blocks = target.blocks || {};
        for (const block of Object.values(blocks)) {
            if (block?.opcode !== 'looks_hide') continue;
            let parent = blocks[block.parent];
            while (parent && SOURCE_DECLARATIONS.has(parent.opcode)) parent = blocks[parent.parent];
            if (parent && parent.topLevel && SCAFFOLD_HATS.has(parent.opcode)) count++;
        }
    }
    return count;
}

/** Split measured differences into real ones and normalization:
 *  - looks_hide lost, up to the number of importer scaffolding hides that disappeared;
 *  - a carrier whose only artwork is a 1x1 fully transparent placeholder (the importer's
 *    stand-in for artwork the source never supplied) and that carries nothing else.
 * Everything else stays a difference. */
export function classifyNormalization (differences, {before, after}) {
    const normalization = [];
    const rest = {...differences};
    const gone = Math.max(0, scaffoldHideCount(before) - scaffoldHideCount(after));
    rest.lostOpcodes = (differences.lostOpcodes || []).flatMap(item => {
        if (item.name !== 'looks_hide' || !gone) return [item];
        const normalized = Math.min(item.before - item.after, gone);
        normalization.push({kind: 'importer scaffolding hide', name: 'looks_hide', count: normalized});
        return item.before - item.after > normalized ? [{...item, before: item.before - normalized}] : [];
    });
    const blank = new Set();
    rest.missingArtwork = (differences.missingArtwork || []).filter(signature => {
        const m = /^(.+):1x1:0+$/.exec(signature);
        if (!m) return true;
        blank.add(m[1]);
        normalization.push({kind: 'blank 1x1 placeholder artwork', name: m[1], count: 1});
        return false;
    });
    rest.missingTargets = (differences.missingTargets || []).filter(name => {
        const target = (before?.targets || []).find(t => t.name === name);
        const costumes = target?.costumes || [];
        const empty = blank.has(name) && Object.values(target?.blocks || {}).every(b => !b || b.shadow ||
            b.opcode === 'looks_hide' || SCAFFOLD_HATS.has(b.opcode));
        if (!empty || !costumes.length) return true;
        normalization.push({kind: 'empty placeholder carrier', name, count: 1});
        return false;
    });
    return {differences: rest, normalization};
}

/** Structure only: no compile state. This is the `structuralRoundtrip` qualification. */
export function structuralOutcome (path, row = {}) {
    if (path.error) return 'failed';
    if (Object.values(path.differences || {}).some(v => v.length)) return 'loss';
    if (row.importUnsupported?.length || path.exportUnsupported?.length || path.importUnsupported?.length) return 'partial';
    if (path.normalization?.length) return NORMALIZED;
    return path.binaryAssetsNotRepresented ? BINARY_NOT_COMPARED : 'preserved';
}

/** Tally key: a failed or invalid recompile outranks the structural outcome. */
export function pathOutcome (path, row = {}) {
    if (path.error) return 'failed';
    if (path.compile?.status === 'fail') return 'compile-failed';
    if (path.compile?.status === 'source-invalid') return 'source-invalid';
    return structuralOutcome(path, row);
}
