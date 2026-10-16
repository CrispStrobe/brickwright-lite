const primitiveOwner = require('./bw-primitive-owner');
const cachedOwner = require('./bw-cached-primitive-owner');

// Neither Error properties nor a null-looking serialized value confer fault
// ownership. Metadata issuances and fault receipts never leave these WeakMaps.
const rows = new WeakMap(), adapters = new WeakMap(), issues = new WeakMap();
const receipts = new WeakMap();
const rowOwner = Symbol('actual Sprite getter declaration');
const rowIssue = Symbol('actual Sprite getter registration issuance');
const properties = new Set(['x', 'y', 'width', 'height']);
const opcode = 'arcade_spriteProperty';

function adapterCurrent(owner, record) {
    return !!record && owner.isCurrent() && owner.isInstance(record.instance) &&
        Object.getOwnPropertyDescriptor(record.adapter, '_inst')?.value === record.instance &&
        Object.getOwnPropertyDescriptor(record.adapter, 'spriteProperty')?.value === record.delegate &&
        Object.getPrototypeOf(record.adapter) === record.prototype &&
        !Object.hasOwn(record.adapter, 'getInfo') &&
        Object.getOwnPropertyDescriptor(record.prototype, 'getInfo')?.value === record.getInfo;
}

function declaration(info, owner) {
    const entries = info?.id === 'arcade' && info.blocks?.filter(block => block.opcode === 'spriteProperty');
    if (entries?.length !== 1 || !owner) throw Error('Sprite getter declaration owner is missing');
    rows.set(entries[0], owner);
    Object.defineProperty(entries[0], rowOwner, {value: owner, enumerable: true});
    return info;
}

function bindAdapterInfo(info, adapter, instance) {
    const entry = info?.id === 'arcade' && info.blocks?.find(block => block.opcode === 'spriteProperty');
    const owner = entry && Object.getOwnPropertyDescriptor(entry, rowOwner)?.value;
    if (rows.get(entry) !== owner || !owner?.isInstance(instance) || !owner.isCurrent())
        throw Error('Sprite getter adapter source owner differs');
    const delegate = Object.getOwnPropertyDescriptor(adapter, 'spriteProperty')?.value;
    const prototype = Object.getPrototypeOf(adapter), getInfo = Object.getOwnPropertyDescriptor(prototype, 'getInfo')?.value;
    if (typeof delegate !== 'function' || typeof getInfo !== 'function' || Object.hasOwn(adapter, 'getInfo') ||
        Object.getOwnPropertyDescriptor(adapter, '_inst')?.value !== instance)
        throw Error('Sprite getter adapter delegate differs');
    let record = adapters.get(owner);
    if (!record) {
        record = {adapter, instance, delegate, prototype, getInfo};
        adapters.set(owner, record);
    }
    if (record.adapter !== adapter || record.instance !== instance || record.delegate !== delegate || !adapterCurrent(owner, record))
        throw Error('Sprite getter adapter identity changed');
    const issue = Object.freeze({});
    issues.set(issue, {owner, adapter: record, arguments: entry.arguments, consumed: false});
    Object.defineProperty(entry, rowIssue, {value: issue, enumerable: true});
}

function create(runtime, owner) {
    if (!runtime || typeof runtime.on !== 'function') return Object.freeze({fault() {throw Error('Sprite getter requires a bound runtime');}});
    const getter = runtime.getOpcodeFunction;
    let registration = null, valid = !(runtime._blockInfo || []).some(category => category.id === 'arcade');
    let active = false, disposed = false, generation = 0;
    let targets = new Set();
    const capture = (category, refresh = false) => {
        if (category?.id !== 'arcade' || !valid) return;
        const entries = category.blocks?.filter(entry => entry.json?.type === opcode);
        const entry = entries?.length === 1 && entries[0], issue = issues.get(entry?.info?.[rowIssue]);
        const adapter = adapters.get(owner), func = entry?.info?.func;
        if ((refresh ? registration?.category !== category : !!registration) || !issue || issue.consumed ||
            issue.owner !== owner || issue.adapter !== adapter || issue.arguments !== entry?.info?.arguments ||
            entry?.info?.[rowOwner] !== owner || !adapterCurrent(owner, adapter) ||
            !runtime._blockInfo?.includes(category) || typeof func !== 'function' ||
            typeof getter !== 'function' || runtime.getOpcodeFunction !== getter || getter.call(runtime, opcode) !== func) {
            valid = false;return;
        }
        issue.consumed = true;
        registration = {category, entry, func, adapter, issue, arguments: entry.info.arguments};
    };
    const current = () => valid && active && !disposed && registration && adapterCurrent(owner, registration.adapter) &&
        runtime.getOpcodeFunction === getter && getter.call(runtime, opcode) === registration.func &&
        runtime._blockInfo?.includes(registration.category) && registration.category.id === 'arcade' &&
        registration.category.blocks?.filter(entry => entry.json?.type === opcode).length === 1 &&
        registration.category.blocks.includes(registration.entry) && registration.entry.json?.type === opcode &&
        registration.entry.info?.func === registration.func && registration.entry.info?.arguments === registration.arguments &&
        issues.get(registration.entry.info?.[rowIssue]) === registration.issue && registration.issue.consumed &&
        registration.entry.info?.[rowOwner] === owner;
    const physical = (args, util) => {
        if (!current() || util?.runtime !== runtime || primitiveOwner.current(util, args)?.opcode !== opcode)
            throw Error('Null Sprite getter requires its original current primitive');
        const block = cachedOwner(runtime, util, args, opcode, []);
        // Read only own data slots from the already-evaluated engine arguments.
        // No getter, coercion, BWValues decode, missing argument or public tag.
        const receiver = Object.getOwnPropertyDescriptor(args, 'ID');
        const property = Object.getOwnPropertyDescriptor(args, 'PROPERTY');
        if (!receiver || !Object.hasOwn(receiver, 'value') || receiver.value !== null ||
            !property || !Object.hasOwn(property, 'value') || !properties.has(property.value))
            throw Error('Null Sprite getter requires actual null and a supported current property');
        return {block: block.id, property: property.value};
    };
    runtime.on('EXTENSION_ADDED', capture);
    runtime.on('BLOCKSINFO_UPDATE', category => capture(category, true));
    runtime.on('PROJECT_START', () => {generation++;if (!disposed) {active = true;targets = new Set(runtime.targets);}});
    for (const event of ['PROJECT_STOP_ALL', 'PROJECT_LOADED']) runtime.on(event, () => {active = false;generation++;});
    runtime.on('RUNTIME_DISPOSED', () => {active = false;disposed = true;generation++;});
    runtime.on('PROJECT_LOADED', () => {
        if (disposed && runtime.targets?.length && runtime.targets.every(target => !targets.has(target)) &&
            valid && registration && adapterCurrent(owner, registration.adapter) &&
            runtime.getOpcodeFunction === getter && getter.call(runtime, opcode) === registration.func) {
            disposed = false;targets = new Set(runtime.targets);
        }
    });
    return Object.freeze({fault(args, util) {
        const witness = physical(args, util);
        const error = new TypeError('Expected type Sprite but received type null. Did you forget to assign a variable?');
        const lease = Object.freeze({});
        receipts.set(lease, {runtime, args, util, thread: util.thread, generation, error, witness,
            current: () => generation, physical});
        return {error, lease};
    }});
}

function consume(runtime, args, util, error, lease) {
    const saved = receipts.get(lease);
    if (!saved || saved.runtime !== runtime || saved.args !== args || saved.util !== util ||
        saved.thread !== util?.thread || saved.error !== error || saved.generation !== saved.current()) return null;
    receipts.delete(lease);
    const witness = saved.physical(args, util);
    return witness.block === saved.witness.block && witness.property === saved.witness.property ? witness : null;
}

module.exports = Object.freeze({create, declaration, bindAdapterInfo, consume});
