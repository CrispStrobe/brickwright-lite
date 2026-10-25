// This external object bridge never interprets a String as an owned Sprite.
// The caller must revalidate assertExternal even for cached heap records.
const CLASS = '__bwOwnedSDKSprite';
const POSITION = '__bwOwnedSDKSprite_setPosition %s %s %s';
const fields = Object.freeze(['x', 'y', 'width', 'height'].map(name => Object.freeze({
    name, type:'number', native:true, readonly:name === 'width' || name === 'height', visibility:'public'
})));
const method = Object.freeze({name:'setPosition', procedure:POSITION,
    parameters:Object.freeze(['x', 'y'].map(name => Object.freeze({name, type:'number', optional:false}))),
    returnType:'void', visibility:'public'});
module.exports = function createOwnedSpriteBridge(owner, values, operations) {
    const number = value => {
        const decoded = values.decode(value);
        if (typeof decoded !== 'number' || !Number.isFinite(decoded))
            throw new Error('Owned SDK Sprite operation requires an actual finite Number');
        return decoded;
    };
    const finish = (reference, result) => {
        const done = () => {owner.assert(reference);};
        return result && typeof result.then === 'function' ? result.then(done) : done();
    };
    const invoke = (procedure, args, util) => {
        if (procedure !== POSITION || !Array.isArray(args) || args.length !== 3)
            throw new Error('Unknown owned SDK Sprite procedure or argument count');
        const body = owner.body(args[0]), x = number(args[1]), y = number(args[2]);
        return finish(args[0], operations.setPosition(body, x, y, util));
    };
    return Object.freeze({
        matches:procedure => procedure === POSITION,
        invoke,
        heapHooks:Object.freeze({
            definition(name) {
                if (name !== CLASS) return undefined;
                // A caller editing a returned declaration must not change the
                // bridge's fixed operations or lend a source producer fact.
                return Object.freeze({name:CLASS, parent:null, fields:new Map(fields.map(field => [field.name, field])),
                    parameters:Object.freeze([]), initializer:'', constructor:'', methods:new Map([[method.name, method]])});
            },
            external:value => owner.ownsReference(value),
            assertExternal:value => owner.assert(value),
            externalClass(value) {owner.assert(value);return CLASS;},
            get(value, key) {
                const body = owner.body(value);
                if (!fields.some(field => field.name === key)) throw new Error('Unknown owned SDK Sprite field');
                return values.encode(number(body[key]));
            },
            set(value, key, input, util) {
                const body = owner.body(value);
                if (key !== 'x' && key !== 'y') throw new Error('Owned SDK Sprite field is readonly or unknown');
                const next = number(input);
                return finish(value, operations.set(body, key, next, util));
            }
        })
    });
};
