const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const TargetType = require('../../extension-support/target-type');
const Cast = require('../../util/cast');

// Build a `Scratch` shim and run a CrispStrobe extension source, returning a built-in
// extension CLASS (the scratch-vm ExtensionManager instantiates it with `new Cls(runtime)`).
// TurboWarp modules self-register via Scratch.extensions.register; Xcratch modules export
// { blockClass, entry }. Both converge on an object with getInfo() + opcode methods.
module.exports = function makeCrispExtension (source) {
    return class CrispStrobeExtension {
        constructor (runtime) {
            this.runtime = runtime;
            let captured = null;
            const Scratch = {
                BlockType, ArgumentType, TargetType, Cast,
                translate: Object.assign(m => (m && typeof m === 'object' ? (m.default || '') : m), { setup: () => {} }),
                extensions: { register: inst => { captured = inst; }, unsandboxed: true, isPenguinMod: false },
                vm: runtime && runtime.emit ? { runtime } : {}, runtime
            };
            // In the browser the extension's top-level code (language detection etc.) runs with
            // the real window/navigator; we only inject Scratch.
            // eslint-disable-next-line no-new-func
            const run = new Function('Scratch', 'module', 'exports', source);
            const mod = { exports: {} };
            run(Scratch, mod, mod.exports);
            const xcx = mod.exports && (mod.exports.blockClass || (mod.exports.default && mod.exports.default.blockClass));
            const inst = captured || (xcx && new xcx(runtime)) ||
                (typeof mod.exports === 'function' ? new mod.exports(runtime) : mod.exports);
            // delegate getInfo + every opcode method onto this
            this._inst = inst;
            for (let p = inst; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
                for (const k of Object.getOwnPropertyNames(p)) {
                    if (k !== 'constructor' && typeof inst[k] === 'function' && !(k in this)) this[k] = inst[k].bind(inst);
                }
            }
        }
        getInfo () { return this._inst.getInfo(); }
    };
};
