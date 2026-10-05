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
