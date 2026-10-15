// A private bridge from successful native factories to live physical Sprite
// bodies. Raw native handles are never public owned-value authority.
let nextOwnedSprite = 0;
const ownData = (value, keys) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key =>
        !Object.prototype.hasOwnProperty.call(descriptors, key) ||
        !Object.prototype.hasOwnProperty.call(descriptors[key], 'value'))) return null;
    return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
};
const actualMap = value => {try {Map.prototype.has.call(value, {});return true;} catch (_) {return false;}};
module.exports = function createOwnedSpriteValues(runtime, values, images, currentState) {
    let expected = null, disposed = false, generation = 0;
    const records = new Map(), issuedScopes = new Map(), pending = new WeakMap(), bodies = new WeakMap();
    const fail = reason => {throw new Error('Owned SDK Sprite: ' + reason);};
    const state = () => {
        if (!runtime || typeof currentState !== 'function') fail('inactive native owner');
        const selected = currentState();
        if (!selected || selected.current !== true || selected.extension?._runtime !== runtime ||
            !actualMap(selected.sprites) || !selected.scene || typeof selected.scene !== 'object' ||
            !selected.scene.sprites || !Array.isArray(selected.scene.physicsEngine?.members) ||
            !Number.isSafeInteger(selected.epoch) || !Number.isSafeInteger(selected.sceneSerial) || selected.running !== true)
            fail('current native owner and active scene are required');
        return selected;
    };
    const current = () => {
        if (disposed || !expected) fail('inactive native owner');
        const selected = state();
        if (selected.extension !== expected.extension || selected.sprites !== expected.sprites ||
            selected.epoch !== expected.epoch || selected.sceneSerial !== expected.sceneSerial) fail('native owner or run epoch changed');
        return selected;
    };
    const callerCurrent = record => {
        if (record.thread && (!Array.isArray(runtime.threads) || !runtime.threads.includes(record.thread) ||
            record.thread.isKilled || record.thread.status === record.thread.constructor.STATUS_DONE ||
            record.thread.target !== record.target)) fail('creating invocation was cancelled');
        if (record.target && (!Array.isArray(runtime.targets) || !runtime.targets.includes(record.target)))
            fail('creating target was replaced');
    };
    const physical = record => {
        const selected = current();
        if (record.generation !== generation || record.scene !== selected.scene ||
            selected.sprites.get(record.id) !== record.body || selected.scene.sprites[record.id] !== record.body ||
            record.body._destroyed || (record.body.flags & 2) ||
            !selected.scene.physicsEngine.members.includes(record.body)) fail('physical body is stale, destroyed or outside its active scene');
        for (const name of ['x', 'y', 'width', 'height']) {
            const value = record.body[name];
            if (typeof value !== 'number' || !Number.isFinite(value) ||
                ((name === 'width' || name === 'height') && value < 0)) fail('physical Number property is invalid');
        }
        return record.body;
    };
    const referenceShape = value => {
        const wrapper = ownData(value, ['bwReference']);
        const ref = wrapper && ownData(wrapper.bwReference, ['kind', 'id', 'scope']);
        if (!ref || ref.kind !== 'object' || typeof ref.id !== 'string' || typeof ref.scope !== 'string')
            fail('an issued object reference is required');
        return ref;
    };
    const rawReference = value => {
        const ref = referenceShape(value);
        if (values.referenceId(runtime, value, 'object') !== ref.id) fail('foreign or stale object reference');
        return ref;
    };
    const recordOf = value => {
        const ref = rawReference(value), record = records.get(ref.id);
        if (!record) fail('object reference was not issued by this factory');
        physical(record);
        return record;
    };
    return Object.freeze({
        start() {
            if (disposed) fail('disposed native owner');
            const selected = state();generation++;records.clear();
            expected = {extension:selected.extension, sprites:selected.sprites, epoch:selected.epoch, sceneSerial:selected.sceneSerial};
        },
        stop() {generation++;records.clear();expected = null;},
        dispose() {disposed = true;generation++;records.clear();expected = null;},
        isDisposed() {return disposed;},
        begin(image, util) {
            const selected = current(), body = images.body(image);
            const thread = util?.thread, target = util?.target || thread?.target;
            if (thread && target !== thread.target) fail('creating target differs from its invocation');
            const record = {generation, scene:selected.scene, image, imageBody:body, thread, target};
            callerCurrent(record);
            const token = Object.freeze({});pending.set(token, record);return token;
        },
        allocated(token, id) {
            const record = pending.get(token), selected = current();
            if (!record || record.id !== undefined || typeof id !== 'string') fail('allocation token is not current');
            callerCurrent(record);
            const body = selected.sprites.get(id);
            if (!body || body.id !== id || bodies.has(body) || body.image !== record.imageBody ||
                images.body(record.image) !== record.imageBody) fail('allocation does not own the supplied Image body');
            Object.assign(record, {id, body});physical(record);bodies.set(body, record);
        },
        complete(token, result) {
            const record = pending.get(token);
            if (!record || !record.body || result !== record.id) fail('factory did not complete its actual allocation');
            try {
                callerCurrent(record);physical(record);
                // Changing a constructor's image through an unqualified handler
                // is not part of this first domain. Never silently snapshot it.
                if (record.body.image !== record.imageBody || images.body(record.image) !== record.imageBody)
                    fail('constructor Image binding changed');
                const ref = values.reference(runtime, 'object', 'owned-sprite:' + (++nextOwnedSprite));
                records.set(ref.bwReference.id, record);issuedScopes.set(ref.bwReference.id, ref.bwReference.scope);pending.delete(token);return ref;
            } catch (error) {pending.delete(token);throw error;}
        },
        abort(token) {pending.delete(token);},
        body(value) {return recordOf(value).body;},
        assert(value) {recordOf(value);return value;},
        has(value) {try {recordOf(value);return true;} catch (_) {return false;}},
        // Domain routing only. Retain issued id/scope identity after revocation
        // so cached external heap records still reach this owner's refusal.
        ownsReference(value) {
            try {const ref = referenceShape(value);return issuedScopes.get(ref.id) === ref.scope;}
            catch (_) {return false;}
        }
    });
};
