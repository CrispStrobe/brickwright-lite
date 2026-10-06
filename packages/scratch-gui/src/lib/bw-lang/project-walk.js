/**
 * The part of a blocks → text generator that does not depend on the text:
 * finding the scripts, decoding an input, naming a custom block. Shared by the
 * DOS-interpreter languages (Tcl via partcl, Lisp via fe), whose generators
 * live beside this file and walk the serialized project the same way
 * SB3Creator.generateBASIC does — over `project.targets[].blocks`, not over
 * pseudocode text.
 *
 * WHY NOT INSIDE SB3Creator. sb3-creator.js is vendored from the sb3-creator
 * repo and byte-checked against its pin (`npm run sync:sb3creator:check`); a
 * language that exists only because this repo ships its interpreter belongs
 * here, downstream, the way bw-asm/pseudocode-8086.js does.
 */

/** Primitive input types in the SB3 serialization (scratch-vm sb3.js). */
const PRIM_NUMBERS = new Set([4, 5, 6, 7, 8]);
const PRIM_TEXT = 10;
const PRIM_VARIABLE = 12;
const PRIM_LIST = 13;

/**
 * Decode one input slot into a small tree the generators switch on:
 *   {kind: 'num', value} | {kind: 'str', value} | {kind: 'var', name}
 *   | {kind: 'list', name} | {kind: 'block', block} | {kind: 'empty'}
 * A literal that reads as a finite number is a number: Scratch does not keep
 * the distinction either (a `[4, "5"]` and a `[10, "5"]` behave alike).
 */
export function decodeInput (input, blocks) {
    if (!input) return {kind: 'empty'};
    const v = input[1];
    if (Array.isArray(v)) {
        if (v[0] === PRIM_VARIABLE) return {kind: 'var', name: String(v[1])};
        if (v[0] === PRIM_LIST) return {kind: 'list', name: String(v[1])};
        const text = String(v[1] ?? '');
        if (PRIM_NUMBERS.has(v[0]) || v[0] === PRIM_TEXT) {
            const n = Number(text);
            if (text.trim() !== '' && Number.isFinite(n)) return {kind: 'num', value: n, text};
            return {kind: 'str', value: text};
        }
        return {kind: 'str', value: text};
    }
    if (typeof v === 'string' && blocks[v]) return {kind: 'block', block: blocks[v]};
    return {kind: 'empty'};
}

export const field = (b, k) => (b.fields && b.fields[k] ? String(b.fields[k][0]) : '');

/**
 * The scripts a generator has to emit: every flag hat and every custom block
 * definition, across all targets (pseudocode programs live on the Stage, but a
 * sprite-owned script is not dropped silently). Anything else at top level —
 * a key hat, a broadcast receiver, a loose reporter — is listed so the
 * generator can refuse it by name instead of losing it.
 */
export function collectScripts (project) {
    const flags = [];
    const procs = [];
    const other = [];
    for (const target of (project && project.targets) || []) {
        const blocks = target.blocks || {};
        for (const [id, b] of Object.entries(blocks)) {
            if (!b || typeof b !== 'object' || !b.topLevel) continue;
            if (b.opcode === 'event_whenflagclicked') flags.push({target, blocks, id, block: b});
            else if (b.opcode === 'procedures_definition') procs.push({target, blocks, id, block: b});
            else other.push({target, blocks, id, block: b});
        }
    }
    return {flags, procs, other};
}

/**
 * A definition's prototype: its proccode, the argument names in order, and
 * whether each is a boolean slot.
 */
export function procPrototype (def, blocks) {
    const protoId = def.inputs && def.inputs.custom_block && def.inputs.custom_block[1];
    const proto = blocks[protoId];
    const m = (proto && proto.mutation) || {};
    const parse = s => { try { return JSON.parse(s || '[]'); } catch (e) { return []; } };
    return {
        proccode: String(m.proccode || ''),
        argumentIds: parse(m.argumentids),
        argumentNames: parse(m.argumentnames),
        warp: m.warp === 'true' || m.warp === true
    };
}

/**
 * A custom block's name as one identifier: the label words of its proccode
 * joined by `_`, the `%s`/`%b` slots dropped. "greet %s %s" → "greet",
 * "draw box %s %s" → "draw_box". The reader's DEFINE line uses this name, so
 * a one-word label round-trips exactly and a multi-word one comes back joined.
 */
export function procName (proccode) {
    const words = String(proccode).split(/\s+/).filter(w => w && !/^%[sbn]$/.test(w));
    return words.join('_') || 'proc';
}

/**
 * Walk a stack from `id` along `next`, calling `fn(block)` for each.
 */
export function eachInStack (id, blocks, fn) {
    let b = blocks[id];
    const seen = new Set();
    while (b && !seen.has(b)) {
        seen.add(b);
        fn(b);
        b = blocks[b.next];
    }
}

/** The first block of a substack input, or null. */
export function substackId (b, key) {
    const input = b.inputs && b.inputs[key];
    return input && typeof input[1] === 'string' ? input[1] : null;
}

/**
 * Every variable a stack (and its nested substacks and reporters) reads or
 * writes. Used to tell whether a custom block body touches globals — which
 * partcl cannot express, since its procs see only their own frame.
 */
export function variablesUsed (startId, blocks) {
    const names = new Set();
    const visit = id => {
        const b = blocks[id];
        if (!b || typeof b !== 'object') return;
        if (b.fields && b.fields.VARIABLE) names.add(String(b.fields.VARIABLE[0]));
        for (const input of Object.values(b.inputs || {})) {
            const v = input && input[1];
            if (Array.isArray(v) && v[0] === PRIM_VARIABLE) names.add(String(v[1]));
            else if (typeof v === 'string') visit(v);
        }
        if (b.next) visit(b.next);
    };
    visit(startId);
    return names;
}

