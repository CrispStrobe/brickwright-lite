// Load a CrispStrobe TurboWarp-unsandboxed extension under a stub `Scratch`
// and dump the real getInfo() plus the opcode method inventory.
import {readFileSync} from 'node:fs';
import {makeRuntime} from './fake-runtime.mjs';

export function loadExtension (source, {locale = 'en'} = {}) {
    let captured = null;
    const BlockType = {
        COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean',
        HAT: 'hat', EVENT: 'event', LOOP: 'loop', CONDITIONAL: 'conditional',
        BUTTON: 'button', LABEL: 'label', XML: 'xml'
    };
    const ArgumentType = {
        ANGLE: 'angle', BOOLEAN: 'Boolean', COLOR: 'color', NUMBER: 'number',
        STRING: 'string', MATRIX: 'matrix', NOTE: 'note', IMAGE: 'image', COSTUME: 'costume', SOUND: 'sound'
    };
    const TargetType = {SPRITE: 'sprite', STAGE: 'stage'};
    const Cast = {
        toString: String, toNumber: v => (Number.isNaN(Number(v)) ? 0 : Number(v)),
        toBoolean: Boolean, toListIndex: n => n, compare: (a, b) => (a < b ? -1 : a > b ? 1 : 0)
    };
    const translate = Object.assign(
        m => (m && typeof m === 'object' ? (m.default || '') : m),
        {setup: () => {}, language: locale}
    );
    const runtime = makeRuntime();
    runtime.getLocale = () => locale;
    const Scratch = {
        BlockType, ArgumentType, TargetType, Cast, translate,
        extensions: {register: inst => { captured = inst; }, unsandboxed: true, isPenguinMod: false},
        vm: {runtime},
        runtime,
        fetch: () => Promise.reject(new Error('no fetch in ledger harness')),
        canFetch: () => Promise.resolve(false)
    };
    const mod = {exports: {}};
    // eslint-disable-next-line no-new-func
    new Function('Scratch', 'module', 'exports', source)(Scratch, mod, mod.exports);
    const inst = captured ||
        (mod.exports.blockClass && new mod.exports.blockClass(Scratch.runtime)) ||
        (typeof mod.exports === 'function' ? new mod.exports(Scratch.runtime) : mod.exports);
    inst.__runtime = runtime;
    return inst;
}

export function methodNames (inst) {
    const out = new Set();
    for (let p = inst; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
        for (const k of Object.getOwnPropertyNames(p)) {
            if (k === 'constructor') continue;
            let v;
            try { v = inst[k]; } catch { continue; }
            if (typeof v === 'function') out.add(k);
        }
    }
    return [...out].sort();
}

export function loadFile (path, opts) {
    return loadExtension(readFileSync(path, 'utf8'), opts);
}
