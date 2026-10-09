const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const TargetType = require('../../extension-support/target-type');
const Cast = require('../../util/cast');
const BWValues = require('../../util/bw-values');
const formatMessage = require('format-message');

// Older bundled extensions sometimes use stable English menu values directly
// as their labels. Preserve those values for saved projects and localize only
// what the learner sees. This also covers bundles whose own translation table
// predates a newly added menu item (for example `forward`).
const GERMAN_MENU_LABELS = {
    forward: 'vorwärts', backward: 'rückwärts', reverse: 'umkehren',
    brake: 'bremsen', coast: 'ausrollen', on: 'an', off: 'aus', any: 'beliebig',
    up: 'oben', down: 'unten', left: 'links', right: 'rechts'
};
const localizeLegacyMenus = info => {
    const locale = String(formatMessage.setup().locale || 'en').toLowerCase();
    if (!locale.startsWith('de') || !info || !info.menus) return info;
    for (const menu of Object.values(info.menus)) {
        if (!menu || !Array.isArray(menu.items)) continue;
        menu.items = menu.items.map(item => {
            if (typeof item !== 'string' || !GERMAN_MENU_LABELS[item]) return item;
            return {text: GERMAN_MENU_LABELS[item], value: item};
        });
    }
    return info;
};

// Xcratch extensions ship as ES modules (`.mjs`) with top-level `export`
// statements, but we run source through `new Function` (a function body, where
// `export` is a syntax error: "export declarations may only appear at top level
// of a module"). These bundles are self-contained (no top-level `import`), so we
// rewrite their exports to CommonJS assignments the adapter already understands.
// Anchored at line start to avoid touching `export`-like text inside code.
const esmToCjs = source => source
    .replace(/^[ \t]*export[ \t]+default[ \t]+/m, 'module.exports.default = ')
    .replace(/^[ \t]*export[ \t]*\{([^}]*)\}[ \t]*;?[ \t]*$/gm, (_match, names) =>
        names
            .split(',')
            .map(n => {
                const [local, exported] = n.trim().split(/\s+as\s+/);
                if (!local) return '';
                return `module.exports[${JSON.stringify((exported || local).trim())}] = ${local.trim()};`;
            })
            .join(' '))
    .replace(/^([ \t]*)export[ \t]+(const|let|var|function|class|async)\b/gm, '$1$2');

// Build a `Scratch` shim and run a CrispStrobe extension source, returning a built-in
// extension CLASS (the scratch-vm ExtensionManager instantiates it with `new Cls(runtime)`).
// TurboWarp modules self-register via Scratch.extensions.register; Xcratch modules export
// { blockClass, entry }. Both converge on an object with getInfo() + opcode methods.
module.exports = function makeCrispExtension (source, dependencies = null) {
    return class CrispStrobeExtension {
        constructor (runtime) {
            this.runtime = runtime;
            let captured = null;
            const Scratch = {
                BlockType, ArgumentType, TargetType, Cast, BWValues,
                // Trusted built-in modules retain their real dependency closures.
                BWExtensionDependencies: dependencies,
                translate: Object.assign(m => (m && typeof m === 'object' ? (m.default || '') : m), { setup: () => {} }),
                extensions: { register: inst => { captured = inst; }, unsandboxed: true, isPenguinMod: false },
                vm: runtime && runtime.emit ? { runtime } : {}, runtime
            };
            // Yes/no questions an extension can wait for (task E7). In the desktop/iOS app
            // `window.confirm` returns a Promise (tauri-plugin-dialog), always truthy, so the
            // CrispStrobe extensions ask through `Scratch.BWConfirm(message) -> Promise<boolean>`
            // when the host offers it, and the browser's confirm otherwise. The GUI installs
            // `runtime.confirmAsync` (lib/extension-confirm-hook.js: E6's confirmAsync, a native
            // OK/Cancel in the app). Read at each question, not at load, so a hook installed
            // after an extension loaded still answers; absent, the field is absent and the
            // extension's own fallback runs.
            Object.defineProperty(Scratch, 'BWConfirm', {
                enumerable: true,
                get: () => (runtime && typeof runtime.confirmAsync === 'function' ?
                    message => runtime.confirmAsync(String(message)) :
                    undefined)
            });
            // In the browser the extension's top-level code (language detection etc.) runs with
            // the real window/navigator; we only inject Scratch.
            // eslint-disable-next-line no-new-func
            const run = new Function('Scratch', 'module', 'exports', esmToCjs(source));
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
        getInfo () { return localizeLegacyMenus(this._inst.getInfo()); }
    };
};
