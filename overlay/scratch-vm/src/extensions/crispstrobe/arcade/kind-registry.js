// Runtime kind allocation uses the complete pinned MIT original source.
// Names are authoring metadata; sprite memberships and handlers capture numbers.
const initializeOriginal = require('./kind-source-pxt');
const builtinNames = ['Player', 'Projectile', 'Food', 'Enemy'];
const numericField = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
module.exports = function createKindRegistry() {
    let original;
    let names;
    function reset() {
        original = initializeOriginal();
        names = new Map(builtinNames.map(name => [name, original.SpriteKind[name]]));
    }
    function bindName(name, kind) {
        if (typeof name !== 'string' || !name.length || typeof kind !== 'number') {
            throw new TypeError('Sprite kind names require an explicit numeric binding');
        }
        if (builtinNames.includes(name) && kind !== original.SpriteKind[name]) {
            throw new TypeError('Original builtin sprite kinds are constant');
        }
        // Binding and rebinding metadata never allocate or change existing numbers.
        names.set(name, kind);
        return kind;
    }
    function normalize(value) {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            if (names.has(value)) return names.get(value);
            // Existing GUI kind fields serialize numeric values as text. Empty or
            // unregistered names must not manufacture a kind or consume an ID.
            const text = value.trim();
            if (numericField.test(text)) return Number(text);
        }
        throw new TypeError('Unregistered or nonnumeric sprite kind: ' + String(value));
    }
    reset();
    return Object.freeze({
        create: () => original.SpriteKind.create(),
        bindName,
        normalize,
        reset,
        builtin: name => {
            if (!builtinNames.includes(name)) throw new TypeError('Unknown builtin sprite kind: ' + String(name));
            return original.SpriteKind[name];
        },
        same: (left, right) => normalize(left) === normalize(right),
        displayName: value => {
            const kind = normalize(value);
            for (const [name, number] of names) if (number === kind) return name;
            return String(kind);
        },
        bindings: () => Array.from(names, ([name, kind]) => Object.freeze({name, kind}))
    });
};
module.exports.sourceIdentity = initializeOriginal.sourceIdentity;
