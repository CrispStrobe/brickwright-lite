'use strict';

const PROTOCOL = 1;
// Capture every validator primitive before reviewed extension source runs. The
// extension shares this realm, so looking these up dynamically would let it
// redefine the validator without ever obtaining the private port.
const ReflectApply = Reflect.apply;
const ReflectOwnKeys = Reflect.ownKeys;
const BooleanCtor = Boolean;
const StringCtor = String;
const ObjectPrototype = Object.prototype;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectKeys = Object.keys;
const ObjectEntries = Object.entries;
const ObjectValues = Object.values;
const ObjectHasOwn = Object.hasOwn;
const ObjectPrototypeHasOwnProperty = Object.prototype.hasOwnProperty;
const ArrayIsArray = Array.isArray;
const ArrayPrototypePush = Array.prototype.push;
const ArrayPrototypeSlice = Array.prototype.slice;
const MapCtor = Map;
const MapPrototypeGet = Map.prototype.get;
const MapPrototypeSet = Map.prototype.set;
const MapPrototypeDelete = Map.prototype.delete;
const MapPrototypeClear = Map.prototype.clear;
const MapPrototypeForEach = Map.prototype.forEach;
const MapPrototypeSize = ObjectGetOwnPropertyDescriptor(Map.prototype, 'size').get;
const SetCtor = Set;
const SetPrototypeAdd = Set.prototype.add;
const SetPrototypeHas = Set.prototype.has;
const SetPrototypeDelete = Set.prototype.delete;
const SetPrototypeSize = ObjectGetOwnPropertyDescriptor(Set.prototype, 'size').get;
const RegExpPrototypeTest = RegExp.prototype.test;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const NumberMaxSafeInteger = Number.MAX_SAFE_INTEGER;
const JSONStringify = JSON.stringify;
const TextEncoderCtor = TextEncoder;
const TextEncoderPrototypeEncode = TextEncoder.prototype.encode;
const PromiseCtor = Promise;
const PromiseReject = Promise.reject;
const PromisePrototypeThen = Promise.prototype.then;
const ErrorCtor = Error;
const LIMITS = ObjectFreeze({extensions: 16, methods: 256, argsBytes: 65536, depth: 16, nodes: 1024});
const METHOD = /^[A-Za-z0-9_]+$/;
const OPERATION = /^[a-z][a-z0-9]*(?:[.:][a-z][a-z0-9]*){1,7}$/;
const FAILURE = new SetCtor(['invalid-session', 'invalid-envelope', 'replayed-request', 'unknown-operation',
    'undeclared-operation', 'invalid-arguments', 'unavailable-operation', 'operation-failed', 'stale-reply']);
const plain = value => ReflectApply(BooleanCtor, undefined, [value]) && typeof value === 'object' &&
    ObjectGetPrototypeOf(value) === ObjectPrototype;
const exact = (value, keys) => {
    try {
        if (!plain(value)) return false;
        const descriptors = ObjectGetOwnPropertyDescriptors(value);
        const actual = ReflectOwnKeys(descriptors);
        if (actual.length !== keys.length) return false;
        for (let index = 0; index < actual.length; index++) {
            const key = actual[index];
            let expected = false;
            for (let expectedIndex = 0; expectedIndex < keys.length; expectedIndex++) {
                if (keys[expectedIndex] === key) { expected = true; break; }
            }
            if (typeof key !== 'string' || !expected || !descriptors[key].enumerable ||
                !ObjectHasOwn(descriptors[key], 'value')) return false;
        }
        return true;
    } catch { return false; }
};

const cloneData = (root, limits = LIMITS) => {
    let nodes = 0;
    const active = new SetCtor();
    const visit = (value, depth) => {
        if (++nodes > limits.nodes || depth > limits.depth) throw new ErrorCtor('invalid-data');
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'number') {
            if (!NumberIsFinite(value)) throw new ErrorCtor('invalid-data');
            return value;
        }
        if (typeof value !== 'object' || ReflectApply(SetPrototypeHas, active, [value])) throw new ErrorCtor('invalid-data');
        ReflectApply(SetPrototypeAdd, active, [value]);
        const descriptors = ObjectGetOwnPropertyDescriptors(value);
        const keys = ReflectOwnKeys(descriptors);
        let copy;
        if (ArrayIsArray(value)) {
            if (ObjectKeys(value).length !== value.length) throw new ErrorCtor('invalid-data');
            for (let index = 0; index < keys.length; index++) {
                const key = keys[index];
                if (typeof key !== 'string' || (key !== 'length' && !ReflectApply(RegExpPrototypeTest,
                    /^(0|[1-9]\d*)$/, [key]))) throw new ErrorCtor('invalid-data');
            }
            copy = [];
            for (let index = 0; index < value.length; index++) {
                const descriptor = descriptors[ReflectApply(StringCtor, undefined, [index])];
                if (!descriptor || !descriptor.enumerable || !ObjectHasOwn(descriptor, 'value')) {
                    throw new ErrorCtor('invalid-data');
                }
                ReflectApply(ArrayPrototypePush, copy, [visit(descriptor.value, depth + 1)]);
            }
        } else {
            if (!plain(value)) throw new ErrorCtor('invalid-data');
            for (let index = 0; index < keys.length; index++) if (typeof keys[index] !== 'string') {
                throw new ErrorCtor('invalid-data');
            }
            copy = {};
            const entries = ObjectEntries(descriptors);
            for (let index = 0; index < entries.length; index++) {
                const key = entries[index][0]; const descriptor = entries[index][1];
                if (!descriptor.enumerable || !ObjectHasOwn(descriptor, 'value')) throw new ErrorCtor('invalid-data');
                ObjectDefineProperty(copy, key, {value: visit(descriptor.value, depth + 1), enumerable: true});
            }
        }
        ReflectApply(SetPrototypeDelete, active, [value]);
        return ObjectFreeze(copy);
    };
    const result = visit(root, 0);
    const encoded = ReflectApply(TextEncoderPrototypeEncode, new TextEncoderCtor(), [JSONStringify(result)]);
    if (encoded.byteLength > limits.argsBytes) throw new ErrorCtor('invalid-data');
    return result;
};

const lockProperty = (object, name, value) => {
    if (!object) return;
    let owner = object;
    while (owner && !ReflectApply(ObjectPrototypeHasOwnProperty, owner, [name])) owner = ObjectGetPrototypeOf(owner);
    if (!owner) return;
    ObjectDefineProperty(owner, name, {value, configurable: false, writable: false});
    if (object[name] !== value) throw new ErrorCtor('worker-lock-failed');
};

const lockEscapes = realm => {
    const blocked = name => function () { throw new ErrorCtor(`${name} is unavailable`); };
    for (const name of ['Worker', 'SharedWorker', 'WebSocket', 'EventSource', 'MessageChannel', 'BroadcastChannel']) {
        if (typeof realm[name] !== 'undefined') lockProperty(realm, name, blocked(name));
    }
    if (typeof realm.importScripts !== 'undefined') lockProperty(realm, 'importScripts', blocked('importScripts'));
    if (typeof realm.postMessage !== 'undefined') lockProperty(realm, 'postMessage', blocked('postMessage'));
    if (realm.navigator) for (const name of ['bluetooth', 'serial', 'usb', 'hid']) {
        if (typeof realm.navigator[name] !== 'undefined') lockProperty(realm.navigator, name, undefined);
    }
};

const methodName = value => typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    ReflectApply(RegExpPrototypeTest, METHOD, [value]);
const dataMethod = (object, name) => {
    let owner = object;
    while (owner && owner !== ObjectPrototype) {
        const descriptor = ObjectGetOwnPropertyDescriptor(owner, name);
        if (descriptor) return ObjectHasOwn(descriptor, 'value') && typeof descriptor.value === 'function' ?
            descriptor.value : null;
        owner = ObjectGetPrototypeOf(owner);
    }
    return null;
};
const registrationFor = (extension, extensionId) => {
    const getInfo = dataMethod(extension, 'getInfo');
    if (!getInfo) throw new ErrorCtor('invalid-registration');
    const info = ReflectApply(getInfo, extension, []);
    if (!plain(info)) throw new ErrorCtor('invalid-registration');
    const infoDescriptors = ObjectGetOwnPropertyDescriptors(info);
    const blocksDescriptor = infoDescriptors.blocks;
    if (!blocksDescriptor || !ObjectHasOwn(blocksDescriptor, 'value') || !ArrayIsArray(blocksDescriptor.value)) {
        throw new ErrorCtor('invalid-registration');
    }
    const blockDescriptors = ObjectGetOwnPropertyDescriptors(blocksDescriptor.value);
    const blockKeys = ReflectOwnKeys(blockDescriptors);
    if (ObjectKeys(blocksDescriptor.value).length !== blocksDescriptor.value.length) {
        throw new ErrorCtor('invalid-registration');
    }
    for (let index = 0; index < blockKeys.length; index++) {
        const key = blockKeys[index];
        if (typeof key !== 'string' || (key !== 'length' && !ReflectApply(RegExpPrototypeTest,
            /^(0|[1-9]\d*)$/, [key]))) throw new ErrorCtor('invalid-registration');
    }
    const opcodes = [];
    for (let index = 0; index < blocksDescriptor.value.length; index++) {
        const item = blockDescriptors[ReflectApply(StringCtor, undefined, [index])];
        if (!item || !item.enumerable || !ObjectHasOwn(item, 'value')) throw new ErrorCtor('invalid-registration');
        const block = item.value;
        if (!plain(block)) continue;
        const blockFields = ObjectGetOwnPropertyDescriptors(block);
        const blockFieldKeys = ReflectOwnKeys(blockFields);
        for (let fieldIndex = 0; fieldIndex < blockFieldKeys.length; fieldIndex++) {
            const key = blockFieldKeys[fieldIndex];
            if (typeof key !== 'string' || !blockFields[key].enumerable ||
                !ObjectHasOwn(blockFields[key], 'value')) throw new ErrorCtor('invalid-registration');
        }
        const opcode = ObjectGetOwnPropertyDescriptor(block, 'opcode');
        if (!opcode || !ObjectHasOwn(opcode, 'value') || !methodName(opcode.value)) {
            throw new ErrorCtor('invalid-registration');
        }
        if (!dataMethod(extension, opcode.value)) throw new ErrorCtor('invalid-registration');
        ReflectApply(ArrayPrototypePush, opcodes, [opcode.value]);
    }
    const menus = [];
    const menusDescriptor = infoDescriptors.menus;
    if (menusDescriptor) {
        if (!ObjectHasOwn(menusDescriptor, 'value') || !plain(menusDescriptor.value)) {
            throw new ErrorCtor('invalid-registration');
        }
        const menuDescriptors = ObjectGetOwnPropertyDescriptors(menusDescriptor.value);
        const menuKeys = ReflectOwnKeys(menuDescriptors);
        for (let index = 0; index < menuKeys.length; index++) if (typeof menuKeys[index] !== 'string') {
            throw new ErrorCtor('invalid-registration');
        }
        const menuValues = ObjectValues(menuDescriptors);
        for (let index = 0; index < menuValues.length; index++) {
            const descriptor = menuValues[index];
            if (!descriptor.enumerable || !ObjectHasOwn(descriptor, 'value')) throw new ErrorCtor('invalid-registration');
            const menu = descriptor.value;
            let dynamic;
            if (typeof menu === 'string') dynamic = menu;
            else if (plain(menu)) {
                const items = ObjectGetOwnPropertyDescriptor(menu, 'items');
                if (items && ObjectHasOwn(items, 'value') && typeof items.value === 'string') dynamic = items.value;
            }
            if (dynamic !== undefined) {
                if (!methodName(dynamic)) throw new ErrorCtor('invalid-registration');
                if (!dataMethod(extension, dynamic)) throw new ErrorCtor('invalid-registration');
                ReflectApply(ArrayPrototypePush, menus, [dynamic]);
            }
        }
    }
    const unique = new SetCtor();
    for (let index = 0; index < opcodes.length; index++) ReflectApply(SetPrototypeAdd, unique, [opcodes[index]]);
    for (let index = 0; index < menus.length; index++) ReflectApply(SetPrototypeAdd, unique, [menus[index]]);
    if (ReflectApply(SetPrototypeSize, unique, []) !==
        opcodes.length + menus.length) throw new ErrorCtor('invalid-registration');
    return ObjectFreeze({extensionId, opcodes: ObjectFreeze(opcodes), menus: ObjectFreeze(menus)});
};

const installNativeBrokerExtensionWorker = options => {
    const {port, realm = globalThis, evaluate = source => (0, eval)(source),
        ArgumentType = {}, BlockType = {}, TargetType = {}, Cast = {}} = options || {};
    if (!port || typeof port.postMessage !== 'function' || typeof evaluate !== 'function') {
        throw new TypeError('Invalid native broker worker host');
    }
    let phase = 'bootstrap';
    let workerId = null;
    let nextRequestId = 0;
    let nextCapabilityId = 0;
    const extensions = [];
    const capabilityPending = new MapCtor();
    let registrations = [];
    const send = message => { if (phase !== 'closed') port.postMessage(message); };
    const close = () => {
        if (phase === 'closed') return;
        phase = 'closed'; registrations = null; extensions.length = 0;
        ReflectApply(MapPrototypeForEach, capabilityPending,
            [pending => pending.reject(new ErrorCtor('capability worker closed'))]);
        ReflectApply(MapPrototypeClear, capabilityPending, []);
        try { if (typeof port.close === 'function') port.close(); } catch {}
    };
    const fail = code => { try { send({protocol: PROTOCOL, kind: 'failure', workerId, code}); } catch {} close(); };
    const translate = message => {
        if (!plain(message)) return message;
        const descriptor = ObjectGetOwnPropertyDescriptor(message, 'default');
        return descriptor && ObjectHasOwn(descriptor, 'value') ? (descriptor.value || '') : '';
    };
    ObjectDefineProperty(translate, 'setup', {value: () => {}, enumerable: true});
    const register = extension => {
        if (phase !== 'evaluating' || !extension ||
            (typeof extension !== 'object' && typeof extension !== 'function')) {
            throw new ErrorCtor('invalid-registration');
        }
        if (extensions.length >= LIMITS.extensions) throw new ErrorCtor('invalid-registration');
        const extensionId = extensions.length;
        const registration = registrationFor(extension, extensionId);
        let methodCount = registration.opcodes.length + registration.menus.length;
        for (let index = 0; index < registrations.length; index++) {
            methodCount += registrations[index].opcodes.length + registrations[index].menus.length;
        }
        if (methodCount > LIMITS.methods) throw new ErrorCtor('invalid-registration');
        const methods = new SetCtor();
        for (let index = 0; index < registration.opcodes.length; index++) {
            ReflectApply(SetPrototypeAdd, methods, [registration.opcodes[index]]);
        }
        for (let index = 0; index < registration.menus.length; index++) {
            ReflectApply(SetPrototypeAdd, methods, [registration.menus[index]]);
        }
        ReflectApply(ArrayPrototypePush, extensions, [ObjectFreeze({extension, methods})]);
        ReflectApply(ArrayPrototypePush, registrations, [registration]);
    };
    const requestCapability = (operation, args) => {
        if (phase !== 'ready' || typeof operation !== 'string' || operation.length > 128 ||
            !ReflectApply(RegExpPrototypeTest, OPERATION, [operation]) ||
            ReflectApply(MapPrototypeSize, capabilityPending, []) >= 64) {
            return ReflectApply(PromiseReject, PromiseCtor, [new ErrorCtor('capability request refused')]);
        }
        if (nextCapabilityId >= NumberMaxSafeInteger) {
            return ReflectApply(PromiseReject, PromiseCtor, [new ErrorCtor('capability request refused')]);
        }
        let copy;
        try { copy = cloneData(args); } catch {
            return ReflectApply(PromiseReject, PromiseCtor, [new ErrorCtor('capability request refused')]);
        }
        if (!plain(copy)) return ReflectApply(PromiseReject, PromiseCtor, [new ErrorCtor('capability request refused')]);
        const requestId = nextCapabilityId++;
        return new PromiseCtor((resolve, reject) => {
            ReflectApply(MapPrototypeSet, capabilityPending, [requestId, {resolve, reject}]);
            try { send({protocol: PROTOCOL, kind: 'capability', workerId, requestId, operation, args: copy}); }
            catch (error) { ReflectApply(MapPrototypeDelete, capabilityPending, [requestId]);
                reject(new ErrorCtor('capability request refused')); }
        });
    };
    const scratch = ObjectFreeze({ArgumentType, BlockType, TargetType, Cast, translate,
        capabilities: ObjectFreeze({request: requestCapability}),
        extensions: ObjectFreeze({register, unsandboxed: false, isPenguinMod: false})});
    const onMessage = async message => {
        try {
            if (phase === 'bootstrap') {
                if (!exact(message, ['protocol', 'workerId', 'source']) || message.protocol !== PROTOCOL ||
                    !NumberIsSafeInteger(message.workerId) || message.workerId < 0 || typeof message.source !== 'string') {
                    return fail('invalid-bootstrap');
                }
                workerId = message.workerId;
                phase = 'evaluating';
                lockEscapes(realm);
                ObjectDefineProperty(realm, 'Scratch', {value: scratch, configurable: false, writable: false});
                evaluate(message.source, scratch);
                if (!registrations.length) throw new ErrorCtor('invalid-registration');
                phase = 'ready';
                send({protocol: PROTOCOL, kind: 'registration', workerId,
                    extensions: ObjectFreeze(ReflectApply(ArrayPrototypeSlice, registrations, []))});
                registrations = null;
                return;
            }
            if (phase !== 'ready') return fail('invalid-state');
            const capabilitySuccess = exact(message,
                ['protocol', 'kind', 'workerId', 'requestId', 'result']);
            const capabilityFailure = exact(message,
                ['protocol', 'kind', 'workerId', 'requestId', 'failure']);
            if (capabilitySuccess || capabilityFailure) {
                if (message.protocol !== PROTOCOL || message.kind !== 'capability-reply' ||
                    message.workerId !== workerId || !NumberIsSafeInteger(message.requestId) ||
                    message.requestId < 0) return fail('invalid-capability-reply');
                const pending = ReflectApply(MapPrototypeGet, capabilityPending, [message.requestId]);
                if (!pending) return fail('invalid-capability-reply');
                if (capabilityFailure && (typeof message.failure !== 'string' ||
                    !ReflectApply(SetPrototypeHas, FAILURE, [message.failure]))) {
                    return fail('invalid-capability-reply');
                }
                let result;
                if (capabilitySuccess) {
                    try { result = cloneData(message.result); } catch { return fail('invalid-capability-reply'); }
                }
                ReflectApply(MapPrototypeDelete, capabilityPending, [message.requestId]);
                if (capabilityFailure) {
                    const error = new ErrorCtor('Capability request refused');
                    ObjectDefineProperty(error, 'code', {value: message.failure, enumerable: true});
                    pending.reject(error);
                }
                else pending.resolve(result);
                return;
            }
            if (exact(message, ['protocol', 'kind', 'workerId']) && message.protocol === PROTOCOL &&
                message.kind === 'terminate' && message.workerId === workerId) {
                send({protocol: PROTOCOL, kind: 'terminated', workerId}); close(); return;
            }
            if (!exact(message, ['protocol', 'kind', 'workerId', 'requestId', 'extensionId', 'method', 'args']) ||
                message.protocol !== PROTOCOL || message.kind !== 'call' || message.workerId !== workerId ||
                !NumberIsSafeInteger(message.requestId) || message.requestId !== nextRequestId ||
                !NumberIsSafeInteger(message.extensionId) || message.extensionId < 0 || !methodName(message.method)) {
                return fail('invalid-call');
            }
            nextRequestId++;
            const provider = extensions[message.extensionId];
            if (!provider || !ReflectApply(SetPrototypeHas, provider.methods, [message.method])) return fail('unknown-method');
            const args = cloneData(message.args);
            if (!plain(args)) return fail('invalid-data');
            const method = dataMethod(provider.extension, message.method);
            if (!method) return fail('unknown-method');
            let result;
            try { result = cloneData(await ReflectApply(method, provider.extension, [args])); }
            catch { return fail('operation-failed'); }
            send({protocol: PROTOCOL, kind: 'reply', workerId, requestId: message.requestId, result});
        } catch { fail(phase === 'evaluating' ? 'invalid-registration' : 'operation-failed'); }
    };
    const portMessage = event => {
        ReflectApply(PromisePrototypeThen, onMessage(event.data), [undefined, () => close()]);
    };
    if (typeof port.addEventListener === 'function') port.addEventListener('message', portMessage);
    else port.onmessage = portMessage;
    if (typeof port.start === 'function') port.start();
    return ObjectFreeze({receive: onMessage, terminate: close, snapshot: () => ObjectFreeze({phase, workerId,
        extensions: extensions.length, nextRequestId,
        capabilityPending: ReflectApply(MapPrototypeSize, capabilityPending, [])})});
};

module.exports = {installNativeBrokerExtensionWorker, LIMITS, PROTOCOL};
