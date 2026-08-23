/**
 * Run a shipped BrickWright program in the REAL Scratch VM, headless.
 *
 * The path mirrors what the Code tab does when you press "⇦ To blocks" and then
 * the green flag: SB3Creator.parse -> generateSB3 -> vm.loadProject ->
 * runtime.stc = project.stc -> greenFlag -> step. Nothing here is a
 * re-implementation of the runtime; the assertions are made against the same
 * scratch-vm the browser bundle builds from.
 *
 * Two deliberate deviations from the browser, both stated rather than hidden:
 *
 *  1. Extensions are registered INTERNALLY (`_registerInternalExtension`) from
 *     lite's bundled sources instead of being fetched into a sandbox Worker,
 *     because node has no Worker. The extension object is the same one the
 *     browser builds — see bw-extensions.mjs.
 *  2. There is no renderer and no storage, so costumes/sounds do not load and
 *     motion/looks blocks are inert. Variables, control flow, custom blocks and
 *     extension blocks all run for real.
 *
 * `import VM from '<...>/scratch-vm/src/index.js'` and not `'scratch-vm'`: the
 * package main points at `dist/node/scratch-vm.js`, which is the UNPATCHED
 * bundle. The browser builds from `src` through a webpack alias, so `src` is
 * what ships and `src` is what this measures.
 */
import path from 'node:path';
import {REPO, INTEGRATED} from './bw-integrated.mjs';
import {bundledExtensionIds, loadExtensionClass, probeExtension, stubRuntime} from './bw-extensions.mjs';

export {REPO, INTEGRATED};

export const SB3Creator = (await import(path.join(INTEGRATED, 'src', 'lib', 'sb3-creator.js'))).default;
export const VM = (await import(path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js'))).default;

const EXTENSION_IDS = bundledExtensionIds();
const classCache = new Map();
function extensionClass (id) {
    if (!classCache.has(id)) classCache.set(id, loadExtensionClass(EXTENSION_IDS.get(id)));
    return classCache.get(id);
}

/** The bundled extension id that owns an opcode, or null. Longest prefix wins. */
export function ownerOf (opcode) {
    let owner = null;
    for (const id of EXTENSION_IDS.keys()) {
        if (opcode.startsWith(`${id}_`) && (!owner || id.length > owner.length)) owner = id;
    }
    return owner;
}

export const CORE_PREFIX = /^(motion|looks|sound|event|control|sensing|operator|data|procedures|argument|music|pen)_/;

/** Every opcode a parsed project contains, before it reaches the VM. */
export function projectOpcodes (project) {
    const opcodes = new Set();
    for (const target of project.targets || []) {
        for (const block of Object.values(target.blocks || {})) {
            if (block && block.opcode) opcodes.add(block.opcode);
        }
    }
    return opcodes;
}

/**
 * What the bundled extensions provide for THIS project's declarations.
 * Returns `{provided: Set<opcode>, missing: [{opcode, defined, implemented}], errors: []}`.
 */
export function conformance (project) {
    const runtime = stubRuntime(project.stc);
    const probes = new Map();
    const provided = new Set();
    const missing = [];
    const errors = [];
    for (const opcode of projectOpcodes(project)) {
        if (CORE_PREFIX.test(opcode) || !opcode.includes('_')) continue;
        const id = ownerOf(opcode);
        if (!id) { missing.push({opcode, defined: false, implemented: false, extension: null}); continue; }
        if (!probes.has(id)) probes.set(id, probeExtension(extensionClass(id), runtime));
        const probe = probes.get(id);
        if (probe.error) { errors.push({extension: id, error: probe.error}); continue; }
        const bare = opcode.slice(id.length + 1);
        const defined = probe.opcodes.has(bare);
        const implemented = probe.methods.has(bare);
        if (defined && implemented) provided.add(opcode);
        else missing.push({opcode, defined, implemented, extension: id});
    }
    return {provided, missing, errors};
}

/**
 * Register lite's bundled extensions on a VM in-process (no Worker in node),
 * with every opcode method counted.
 *
 * The call counter is the gate's liveness instrument. "The program ran" is
 * cheap to satisfy — an empty forever-loop satisfies it. "A hardware verb this
 * program authored was actually invoked by the real VM through the real shipped
 * extension" is not, and it is exactly what the five inert gallery examples
 * (`set variable X to Y`) failed to do: they parse, they load, they step, and no
 * extension method is ever reached.
 *
 * Reads are counted alongside writes on purpose. A program whose actuation sits
 * behind a sensor threshold may legitimately never take that branch in a
 * headless run, but it still polls — so counting reads keeps the signal free of
 * false accusations while still going to zero for a program that lost its
 * hardware verbs to a syntax slip.
 */
function registerBundledExtensions (vm, calls) {
    const manager = vm.extensionManager;
    const original = manager.loadExtensionURL.bind(manager);
    manager.loadExtensionURL = id => {
        const key = String(id);
        if (EXTENSION_IDS.has(key)) {
            const instance = new (extensionClass(key))(vm.runtime);
            for (const name of Object.getOwnPropertyNames(instance)) {
                const method = instance[name];
                if (typeof method !== 'function' || name === 'getInfo') continue;
                instance[name] = function (...args) {
                    calls.set(`${key}_${name}`, (calls.get(`${key}_${name}`) || 0) + 1);
                    return method.apply(this, args);
                };
            }
            const service = manager._registerInternalExtension(instance);
            manager._loadedExtensions.set(key, service);
            return Promise.resolve();
        }
        return original(id);
    };
}

/**
 * Timers an extension starts while a project runs.
 *
 * Several bundled extensions (BLE reconnect, gamepad poll) install an interval
 * on construction or on first use. `vm.quit()` clears the runtime's own stepping
 * interval but knows nothing about theirs, so node:test finishes every assertion
 * and then never exits — which reads as a hang, not as a result. Capture and
 * clear them around every run.
 */
const strayTimers = new Set();
{
    // Patched for the lifetime of the harness rather than around each call:
    // extensions install timers from async continuations too, and a
    // try/finally around a promise-returning call restores the globals before
    // those run.
    const realInterval = globalThis.setInterval;
    const realTimeout = globalThis.setTimeout;
    globalThis.setInterval = (...args) => { const h = realInterval(...args); strayTimers.add(h); return h; };
    globalThis.setTimeout = (...args) => { const h = realTimeout(...args); strayTimers.add(h); return h; };
}
export function clearStrayTimers () {
    for (const handle of strayTimers) {
        try { clearInterval(handle); } catch { /* noop */ }
        try { clearTimeout(handle); } catch { /* noop */ }
    }
    strayTimers.clear();
}

const started = new Set();
const realStart = VM.prototype.start;
VM.prototype.start = function () { started.add(this); return realStart.call(this); };
const realQuit = VM.prototype.quit;
VM.prototype.quit = function () { started.delete(this); return realQuit.call(this); };
/** Kill any VM a failed assertion left stepping — otherwise node:test never exits. */
export function quitStrandedVMs () {
    for (const vm of started) { try { vm.quit(); } catch { /* noop */ } }
    started.clear();
    clearStrayTimers();
}

/**
 * Parse, package, load and step one program.
 *
 * Returns everything an assertion might need: the creator (for the parsed
 * project), the vm, the opcodes that survived deserialization, and the
 * extension ids the VM actually loaded.
 */
function variableSnapshot (vm) {
    const snapshot = new Map();
    for (const target of vm.runtime.targets) {
        for (const variable of Object.values(target.variables || {})) {
            snapshot.set(`${target.id}/${variable.name}`, JSON.stringify(variable.value));
        }
    }
    return snapshot;
}

export async function runProgram (source, {frames = 12} = {}) {
    const creator = new SB3Creator();
    creator.parse(source);
    const buffer = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
    const vm = new VM();
    const calls = new Map();
    registerBundledExtensions(vm, calls);
    await vm.loadProject(buffer);
    if (creator.project.stc) vm.runtime.stc = creator.project.stc;
    const loadedOpcodes = new Set();
    let blockCount = 0;
    for (const target of vm.runtime.targets) {
        for (const block of Object.values(target.blocks._blocks || {})) {
            loadedOpcodes.add(block.opcode);
            blockCount++;
        }
    }
    const errors = [];
    const onError = message => errors.push(String(message));
    vm.runtime.on('BLOCKS_ERROR', onError);
    vm.on('BLOCKS_ERROR', onError);
    const before = variableSnapshot(vm);
    vm.start();
    vm.greenFlag();
    const threadsStarted = vm.runtime.threads.length;
    for (let i = 0; i < frames; i++) vm.runtime._step();
    const after = variableSnapshot(vm);
    vm.quit();
    clearStrayTimers();
    let variablesChanged = 0;
    for (const [name, value] of after) if (before.get(name) !== value) variablesChanged++;
    let extensionCalls = 0;
    for (const count of calls.values()) extensionCalls += count;
    return {creator, vm, buffer, loadedOpcodes, blockCount, threadsStarted, errors,
        calls, extensionCalls, variablesChanged,
        loadedExtensions: new Set(vm.extensionManager._loadedExtensions.keys())};
}
