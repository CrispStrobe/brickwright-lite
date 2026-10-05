// SPDX-License-Identifier: BSD-3-Clause
/**
 * bw-values — MakeCode/JavaScript values that Scratch's own value model cannot
 * hold, for extensions that run translated MakeCode Arcade programs.
 *
 * Exposed to every bundled CrispStrobe extension as `Scratch.BWValues`
 * (extensions/crispstrobe/adapter.js). Nothing in scratch-vm calls it: until an
 * extension does, projects behave exactly as before. Ported from the parked
 * Codex WIP (`23e9c7f44`, task E3a of docs/OPEN-TASKS-2026-09-29.md); the code
 * below that header is the WIP's, unchanged, so the Arcade extension (E1) binds
 * to the same API it was written against.
 *
 * WHAT IT CARRIES
 *  - UNDEFINED: MakeCode's `undefined` as a value. Scratch reads an undefined
 *    reporter result as "reported nothing", so it travels as the frozen tagged
 *    object {bwUndefined: true} (String() -> 'undefined', valueOf() -> NaN).
 *    encode(undefined) -> UNDEFINED; decode(UNDEFINED) -> undefined.
 *  - Reference values: {bwReference: {kind, id, scope}} for kind in array,
 *    image, tile, animation, scene, physics-engine. reference(runtime, kind, id)
 *    makes one; references with the same (scope, kind, id) are ONE object
 *    (interned, also after a JSON round trip through decode), so a reference
 *    stored in a variable or list item and read back is === to the original.
 *    The scope belongs to one runtime and one project run: it is renewed on
 *    PROJECT_START (green flag) and PROJECT_LOADED, after which
 *    referenceId(runtime, oldRef, kind) is null — a reference never names a
 *    resource of another run, another project or another VM.
 *  - Arrays by reference: arrayReference(runtime, array) / arrayValue(runtime,
 *    ref) keep one heap of real JS arrays per runtime (cleared on PROJECT_START,
 *    PROJECT_LOADED, RUNTIME_DISPOSED); the same array always gets the same id.
 *  - Non-finite numbers in JSON: jsonReplacer writes NaN/Infinity/-Infinity/-0
 *    as {bwNumber: '...'}, and decode turns them back into numbers.
 *  - JavaScript operators over these values: compare (== != === !== < > <= >=),
 *    equal, indexOf (by equal), binary (+ - * / %), unary (+ -), truth. Two
 *    references are equal only when they are the same reference.
 *
 * WHAT IT DOES NOT DO (measured on main, test/bw-values.test.mjs)
 *  - Scratch's own blocks do not know these values. A variable or list keeps
 *    the object and returns it identically, but Scratch's `=`, `item # of` and
 *    `contains` compare through Cast, where every reference is the string
 *    '[object Object]': two DIFFERENT references are "equal" to Scratch. Only
 *    BWValues.compare/equal/indexOf tell them apart.
 *  - Saving: stock sb3 serialization writes a reference or UNDEFINED held in a
 *    variable as a JSON object, and scratch-parser then REFUSES the saved
 *    project (variable values must be string or number), so it no longer
 *    loads. Making such values survive save/load is the `sb3.js` serialization
 *    piece of task E3, not this file.
 */
// Undefined is a value in MakeCode. Scratch also uses an undefined result
// to mean a command did not report anything, so carry it as a tagged value.
// The tag survives project JSON; conversion is centralized at native boundaries.
const isUndefined = value => value && typeof value === 'object' &&
    Object.keys(value).length === 1 && value.bwUndefined === true;
const UNDEFINED = Object.freeze(Object.defineProperties({bwUndefined: true}, {
    toString: {value: () => 'undefined'}, valueOf: {value: () => NaN}
}));
const scopes = new WeakMap();
const session = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
let nextScope = 0;
const references = new Map();
const collected = new FinalizationRegistry(key => {
    if (!references.get(key)?.deref()) references.delete(key);
});
const isReference = value => value && typeof value === 'object' && Object.keys(value).length === 1 &&
    ['array','image','tile','animation','scene','physics-engine'].includes(value.bwReference?.kind) && typeof value.bwReference.id === 'string' && typeof value.bwReference.scope === 'string';
const restoreReference = value => {
    const key = JSON.stringify([value.bwReference.scope, value.bwReference.kind, value.bwReference.id]);
    const existing = references.get(key)?.deref();
    if (existing) return existing;
    references.set(key, new WeakRef(value));
    collected.register(value, key);
    return value;
};
const reference = (runtime, kind, id) => {
    if (!scopes.has(runtime)) {
        scopes.set(runtime, `${session}:${++nextScope}`);
        const reset = () => scopes.set(runtime, `${session}:${++nextScope}`);
        runtime.on?.('PROJECT_START', reset);
        runtime.on?.('PROJECT_LOADED', reset);
    }
    return restoreReference({bwReference: {kind, id, scope: scopes.get(runtime)}});
};
// Extensions share one array heap per runtime. Collections contain actual values;
// references and identity are scoped to the running project, never serialized IDs.
const arrayHeaps = new WeakMap();
const arrayHeap = runtime => {
    if (!arrayHeaps.has(runtime)) {
        const heap = {values: new Map(), objects: new WeakMap(), next: 0};
        arrayHeaps.set(runtime, heap);
        const reset = () => {heap.values.clear(); heap.objects = new WeakMap();};
        for (const event of ['PROJECT_START', 'PROJECT_LOADED', 'RUNTIME_DISPOSED']) runtime.on?.(event, reset);
    }
    return arrayHeaps.get(runtime);
};
const arrayReference = (runtime, array) => {
    if (!Array.isArray(array)) throw new TypeError('Array reference requires an array');
    const heap = arrayHeap(runtime);
    let id = heap.objects.get(array);
    if (!id) {id = `array-reference:${++heap.next}`; heap.objects.set(array, id); heap.values.set(id, array);}
    return reference(runtime, 'array', id);
};
const arrayValue = (runtime, value) => {
    const id = referenceId(runtime, value, 'array');
    return id === null ? undefined : arrayHeap(runtime).values.get(id);
};
const sameReference = (a, b) => isReference(a) && isReference(b) &&
    ['kind', 'id', 'scope'].every(key => a.bwReference[key] === b.bwReference[key]);
const referenceId = (runtime, value, kind) => isReference(value) && value.bwReference.kind === kind &&
    value.bwReference.scope === scopes.get(runtime) ? value.bwReference.id : null;
const decode = value => isUndefined(value) ? undefined : isReference(value) ? restoreReference(value) : value && typeof value === 'object' && Object.keys(value).length === 1 && ['NaN','Infinity','-Infinity','-0'].includes(value.bwNumber) ? Number(value.bwNumber) : value;
const encode = value => value === undefined || isUndefined(value) ? UNDEFINED : decode(value);
// PXT RefCollection and RefImage inherit RefObject. Operators use
// its ordinary object conversion; transport/display IDs are never operands.
const operand = value => decode(value);
const equal = (a, b) => sameReference(a, b) || decode(a) === decode(b);
const indexOf = (array, value, from = 0) => {
    const start = Math.trunc(Number(from)) || 0;
    for (let i = start < 0 ? Math.max(array.length + start, 0) : start; i < array.length; i++) {
        if (i in array && equal(array[i], value)) return i;
    }
    return -1;
};
const binary = (left, op, right) => {
    const a = operand(left), b = operand(right);
    switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '%': return a % b;
    default: throw new Error(`Unknown value arithmetic ${op}`);
    }
};
const unary = (op, value) => {
    const a = operand(value);
    if (op === '+') return +a;
    if (op === '-') return -a;
    throw new Error(`Unknown unary value arithmetic ${op}`);
};
const jsonReplacer = (_key, value) => typeof value === 'number' && (!Number.isFinite(value) || Object.is(value,-0)) ? {bwNumber:Object.is(value,-0)?'-0':String(value)} : value;
module.exports = {arrayReference, arrayValue, UNDEFINED, decode, encode, binary, unary, jsonReplacer, isReference, reference, referenceId, equal, indexOf, truth: value => Boolean(decode(value)),
    compare (left, op, right) {
        const a = operand(left), b = sameReference(left, right) ? a : operand(right);
        switch (op) {
        // These are deliberately JavaScript comparisons, including its
        // null/undefined loose equality and strict primitive distinctions.
        case '==': return a == b; // eslint-disable-line eqeqeq
        case '!=': return a != b; // eslint-disable-line eqeqeq
        case '===': return a === b;
        case '!==': return a !== b;
        case '<': return a < b;
        case '>': return a > b;
        case '<=': return a <= b;
        case '>=': return a >= b;
        default: throw new Error(`Unknown value comparison ${op}`);
        }
    }
};
