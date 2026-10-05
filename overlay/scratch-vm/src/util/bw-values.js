// SPDX-License-Identifier: BSD-3-Clause
/**
 * bw-values — MakeCode/JavaScript values that Scratch's own value model cannot
 * hold, for extensions that run translated MakeCode Arcade programs.
 *
 * Exposed to every bundled CrispStrobe extension as `Scratch.BWValues`
 * (extensions/crispstrobe/adapter.js), so all of them share ONE set of rules
 * and one array heap per runtime: the Arrays extension's reference blocks and
 * the Arcade extension's images, tiles, scenes (task E1) name the same values.
 * Nothing in scratch-vm itself calls it.
 *
 * ONE RULE SET, TWO COPIES. The Arrays extension (CrispStrobe/extensions
 * arrays.js, bundled in extensions/crispstrobe/arrays) carries its own built-in
 * copy, `makeValues`, and uses `Scratch.BWValues` instead whenever the host
 * provides it. The function below is that copy's text (dedented), so the
 * Arrays extension computes exactly what it computed before this file existed;
 * test/bw-values.test.mjs holds the two to the same results. It converges the
 * parked Codex WIP's version (`23e9c7f44`, task E3a of
 * docs/OPEN-TASKS-2026-09-29.md), which had the same API and differed only
 * where it threw or leaked: it threw on a missing runtime, returned a falsy
 * non-boolean from isReference(0), and required WeakRef/FinalizationRegistry.
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
 *    Without a runtime (a unit test, a headless load) one stand-in key is used.
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
 *  - Saving is not done here: serialization/bw-sb3-values.js (task E3b) writes
 *    a reference, UNDEFINED or a non-finite number held in a variable or list
 *    as a plain placeholder plus an exact-value sidecar, because stock sb3
 *    wrote them as JSON objects that scratch-parser refuses (or as 0).
 */
// The Arrays extension's built-in value rules (arrays.js `makeValues`), verbatim.
const makeValues = () => {
  const isUndefined = (value) =>
    Boolean(value) &&
    typeof value === "object" &&
    Object.keys(value).length === 1 &&
    value.bwUndefined === true;
  const UNDEFINED = Object.freeze(
    Object.defineProperties(
      { bwUndefined: true },
      {
        toString: { value: () => "undefined" },
        valueOf: { value: () => NaN },
      }
    )
  );
  const KINDS = [
    "array",
    "image",
    "tile",
    "animation",
    "scene",
    "physics-engine",
  ];
  const scopes = new WeakMap();
  const session =
    Date.now().toString(36) + ":" + Math.random().toString(36).slice(2);
  let nextScope = 0;
  const references = new Map();
  const collected =
    typeof FinalizationRegistry === "function"
      ? new FinalizationRegistry((key) => {
          const held = references.get(key);
          if (!held || !held.deref()) references.delete(key);
        })
      : null;
  const isReference = (value) =>
    Boolean(value) &&
    typeof value === "object" &&
    Object.keys(value).length === 1 &&
    Boolean(value.bwReference) &&
    KINDS.includes(value.bwReference.kind) &&
    typeof value.bwReference.id === "string" &&
    typeof value.bwReference.scope === "string";
  const restoreReference = (value) => {
    const ref = value.bwReference;
    const key = JSON.stringify([ref.scope, ref.kind, ref.id]);
    const held = references.get(key);
    const existing = held && held.deref();
    if (existing) return existing;
    if (typeof WeakRef === "function") {
      references.set(key, new WeakRef(value));
      if (collected) collected.register(value, key);
    }
    return value;
  };
  // Without a runtime (a unit test, a headless load) one key stands in.
  const NO_RUNTIME = {};
  const keyOf = (runtime) => runtime || NO_RUNTIME;
  const listen = (runtime, events, handler) => {
    if (runtime && typeof runtime.on === "function") {
      for (const event of events) runtime.on(event, handler);
    }
  };
  const scopeOf = (runtime) => {
    const key = keyOf(runtime);
    if (!scopes.has(key)) {
      scopes.set(key, session + ":" + ++nextScope);
      listen(runtime, ["PROJECT_START", "PROJECT_LOADED"], () =>
        scopes.set(key, session + ":" + ++nextScope)
      );
    }
    return scopes.get(key);
  };
  const reference = (runtime, kind, id) =>
    restoreReference({ bwReference: { kind, id, scope: scopeOf(runtime) } });
  const heaps = new WeakMap();
  const heapOf = (runtime) => {
    const key = keyOf(runtime);
    if (!heaps.has(key)) {
      const heap = { values: new Map(), objects: new WeakMap(), next: 0 };
      heaps.set(key, heap);
      listen(
        runtime,
        ["PROJECT_START", "PROJECT_LOADED", "RUNTIME_DISPOSED"],
        () => {
          heap.values.clear();
          heap.objects = new WeakMap();
        }
      );
    }
    return heaps.get(key);
  };
  const referenceId = (runtime, value, kind) =>
    isReference(value) &&
    value.bwReference.kind === kind &&
    value.bwReference.scope === scopes.get(keyOf(runtime))
      ? value.bwReference.id
      : null;
  const arrayReference = (runtime, array) => {
    if (!Array.isArray(array)) {
      throw new TypeError("Array reference requires an array");
    }
    const heap = heapOf(runtime);
    let id = heap.objects.get(array);
    if (!id) {
      id = "array-reference:" + ++heap.next;
      heap.objects.set(array, id);
      heap.values.set(id, array);
    }
    return reference(runtime, "array", id);
  };
  const arrayValue = (runtime, value) => {
    const id = referenceId(runtime, value, "array");
    return id === null ? undefined : heapOf(runtime).values.get(id);
  };
  const sameReference = (a, b) =>
    isReference(a) &&
    isReference(b) &&
    ["kind", "id", "scope"].every(
      (key) => a.bwReference[key] === b.bwReference[key]
    );
  const SPECIAL_NUMBERS = ["NaN", "Infinity", "-Infinity", "-0"];
  const decode = (value) => {
    if (isUndefined(value)) return undefined;
    if (isReference(value)) return restoreReference(value);
    if (
      value &&
      typeof value === "object" &&
      Object.keys(value).length === 1 &&
      SPECIAL_NUMBERS.includes(value.bwNumber)
    ) {
      return Number(value.bwNumber);
    }
    return value;
  };
  const encode = (value) =>
    value === undefined || isUndefined(value) ? UNDEFINED : decode(value);
  const equal = (a, b) => sameReference(a, b) || decode(a) === decode(b);
  const indexOf = (array, value, from = 0) => {
    const start = Math.trunc(Number(from)) || 0;
    for (
      let i = start < 0 ? Math.max(array.length + start, 0) : start;
      i < array.length;
      i++
    ) {
      if (i in array && equal(array[i], value)) return i;
    }
    return -1;
  };
  const binary = (left, op, right) => {
    const a = decode(left);
    const b = decode(right);
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return a / b;
      case "%":
        return a % b;
      default:
        throw new Error("Unknown value arithmetic " + op);
    }
  };
  const unary = (op, value) => {
    const a = decode(value);
    if (op === "+") return +a;
    if (op === "-") return -a;
    throw new Error("Unknown unary value arithmetic " + op);
  };
  const compare = (left, op, right) => {
    const a = decode(left);
    const b = sameReference(left, right) ? a : decode(right);
    switch (op) {
      // JavaScript's comparisons on purpose, loose null/undefined equality
      // and strict primitive distinctions included.
      case "==":
        return a == b;
      case "!=":
        return a != b;
      case "===":
        return a === b;
      case "!==":
        return a !== b;
      case "<":
        return a < b;
      case ">":
        return a > b;
      case "<=":
        return a <= b;
      case ">=":
        return a >= b;
      default:
        throw new Error("Unknown value comparison " + op);
    }
  };
  const jsonReplacer = (_key, value) =>
    typeof value === "number" &&
    (!Number.isFinite(value) || Object.is(value, -0))
      ? { bwNumber: Object.is(value, -0) ? "-0" : String(value) }
      : value;
  return {
    UNDEFINED,
    arrayReference,
    arrayValue,
    reference,
    referenceId,
    isReference,
    decode,
    encode,
    equal,
    indexOf,
    binary,
    unary,
    compare,
    jsonReplacer,
    truth: (value) => Boolean(decode(value)),
  };
};

module.exports = makeValues();
