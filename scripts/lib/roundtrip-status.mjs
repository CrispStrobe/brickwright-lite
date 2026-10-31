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

const literalInput = (block, name) => {
    const input = block?.inputs?.[name];
    const primitive = Array.isArray(input?.[1]) ? input[1] : null;
    return primitive ? String(primitive[1]) : null;
};

/** `arcade frame image` uses that repeat one (key, template, start, count) tuple. The exporter
 * writes one shared frame array per key and reads it by index, so on re-import the bank is a
 * single frame image block plus indexed reads. Every extra identical use reads the same frames:
 * the block count drops while the program is the same. Returns how many such extra uses exist. */
export function duplicateFrameImageUses (project) {
    const seen = new Map();
    let extra = 0;
    for (const target of project?.targets || []) {
        for (const block of Object.values(target.blocks || {})) {
            if (block?.opcode !== 'arcade_frameImage') continue;
            const parts = ['KEY', 'TEMPLATE', 'START', 'COUNT'].map(name => literalInput(block, name));
            if (parts.includes(null)) continue;
            const tuple = JSON.stringify(parts);
            if (seen.has(tuple)) extra++;
            else seen.set(tuple, true);
        }
    }
    return extra;
}

/** Scratch-model opcodes the first import writes for a sprite whose art or API it cannot resolve
 * (`SPRITE x:` scripts), and the native Arcade opcodes the exported TypeScript comes back as.
 * `exact` pairs must be replaced one for one; the others may be folded away (constant
 * arguments, `0 + n` wrappers), so one native counterpart is enough. */
const NATIVE_COUNTERPARTS = {
    control_forever: {to: ['arcade_sourceWhile'], exact: true},
    motion_gotoxy: {to: ['arcade_setSpritePosition'], exact: true},
    motion_changexby: {to: ['arcade_setSpriteProperty'], exact: true},
    looks_show: {to: ['arcade_setSpriteFlag'], exact: true},
    sensing_keypressed: {to: ['arcade_playerButtonPressed'], exact: true},
    sensing_keyoptions: {to: ['arcade_playerButtonPressed'], exact: true},
    event_whenkeypressed: {to: ['arcade_registerButtonHandler'], exact: true},
    arcade_whenInterval: {to: ['arcade_registerIntervalHandler'], exact: true},
    arcade_setscore: {to: ['arcade_setPlayerScore'], exact: true},
    data_changevariableby: {to: ['data_setvariableto'], exact: true},
    control_create_clone_of: {to: ['arcade_callFunction'], exact: false},
    control_create_clone_of_menu: {to: ['arcade_callFunction'], exact: false},
    operator_lt: {to: ['arrays_valueCompare'], exact: false},
    operator_gt: {to: ['arrays_valueCompare'], exact: false},
    operator_equals: {to: ['arrays_valueCompare'], exact: false},
    operator_subtract: {to: ['arrays_valueBinary', 'operator_add'], exact: false},
    operator_multiply: {to: ['arrays_valueBinary', 'operator_add'], exact: false}
};

const opcodeCounts = project => {
    const counts = {};
    for (const target of project?.targets || []) {
        for (const block of Object.values(target.blocks || {})) {
            if (block?.opcode) counts[block.opcode] = (counts[block.opcode] || 0) + 1;
        }
    }
    return counts;
};

const KIND_VARIABLE = /^__bwNamespace_SpriteKind_[A-Za-z_]\w*$/;

/** Reads of the variables an exported `namespace SpriteKind { export let|const X }` comes back as. */
const kindVariableReads = project => {
    let reads = 0;
    for (const target of project?.targets || []) {
        for (const block of Object.values(target.blocks || {})) {
            if (block?.opcode === 'data_variable' && KIND_VARIABLE.test(String(block.fields?.VARIABLE?.[0]))) reads++;
            for (const input of Object.values(block?.inputs || {})) {
                // An inline variable reporter is the primitive [12, name, id] inside the input.
                for (const part of input.slice(1)) {
                    if (Array.isArray(part) && part[0] === 12 && KIND_VARIABLE.test(String(part[1]))) reads++;
                }
            }
        }
    }
    return reads;
};

/** Split measured differences into real ones and normalization:
 *  - looks_hide lost, up to the number of importer scaffolding hides that disappeared;
 *  - arcade_frameImage lost, up to the number of repeated identical (key, template, start, count) uses;
 *  - Scratch-model opcodes (NATIVE_COUNTERPARTS) that come back as their native Arcade counterpart;
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
    const duplicateFrames = duplicateFrameImageUses(before);
    rest.lostOpcodes = rest.lostOpcodes.flatMap(item => {
        if (item.name !== 'arcade_frameImage' || !duplicateFrames) return [item];
        const normalized = Math.min(item.before - item.after, duplicateFrames);
        normalization.push({kind: 'identical frame image uses share one bank', name: 'arcade_frameImage', count: normalized});
        return item.before - item.after > normalized ? [{...item, before: item.before - normalized}] : [];
    });
    const beforeCounts = opcodeCounts(before), afterCounts = opcodeCounts(after);
    rest.lostOpcodes = rest.lostOpcodes.flatMap(item => {
        const rule = NATIVE_COUNTERPARTS[item.name];
        if (!rule) return [item];
        const gained = rule.to.reduce((n, name) => n + Math.max(0, (afterCounts[name] || 0) - (beforeCounts[name] || 0)), 0);
        const lostCount = item.before - item.after;
        if (rule.exact ? gained < lostCount : gained < 1) return [item];
        normalization.push({kind: 'sprite-model opcode re-imported as native Arcade opcode', name: item.name, count: lostCount});
        return [];
    });
    // `SpriteKind.X` written as a named kind value comes back as a read of the exported namespace member.
    const kindReads = Math.max(0, kindVariableReads(after) - kindVariableReads(before));
    rest.lostOpcodes = rest.lostOpcodes.flatMap(item => {
        if (item.name !== 'arcade_spriteKindValue' || !kindReads) return [item];
        const normalized = Math.min(item.before - item.after, kindReads);
        normalization.push({kind: 'named sprite kind re-imported as namespace member', name: item.name, count: normalized});
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
    // The exporter keeps a sprite `<name>` in a global `<name>Sprite` (export-arcade.js, spriteVar),
    // so the re-import's artwork carrier is `<name>Sprite`. A plain `<name>` cannot be recovered from a
    // variable name alone (a game's own `mySprite` must stay `mySprite`), so it is counted here.
    const afterNames = new Set((after?.targets || []).map(t => t.name));
    rest.missingTargets = (differences.missingTargets || []).filter(name => {
        if (afterNames.has(`${name}Sprite`)) {
            normalization.push({kind: 'sprite handle suffix', name, count: 1});
            return false;
        }
        return true;
    });
    rest.missingTargets = rest.missingTargets.filter(name => {
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
