// SPDX-License-Identifier: MPL-2.0
// Program-owned number settings. SB3 carries identity and a portable snapshot;
// a device's localStorage, when available, holds its latest local records.
const identity = () => globalThis.crypto?.randomUUID?.() ||
    Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
const VERSION = 1;
const PROPERTY = 'bwArcadeSettings';
const encode = value => Number.isFinite(value) && !Object.is(value, -0) ? value :
    {number: Object.is(value, -0) ? '-0' : String(value)};
const decode = value => typeof value === 'number' && Number.isFinite(value) ? value :
    value && typeof value === 'object' && Object.keys(value).length === 1 &&
    ['NaN', 'Infinity', '-Infinity', '-0'].includes(value.number) ? Number(value.number) : undefined;
function validated (value) {
    if (!value || value.version !== VERSION || typeof value.id !== 'string' ||
        !/^[\w.-]{8,100}$/.test(value.id) || !value.values || typeof value.values !== 'object' ||
        Array.isArray(value.values)) return null;
    const values = Object.create(null);
    for (const [key, item] of Object.entries(value.values)) {
        if (decode(item) === undefined) return null;
        values[key] = encode(decode(item));
    }
    return {version: VERSION, id: value.id, values};
}
function deviceStorage () {
    try { return globalThis.localStorage || null; } catch (_) { return null; }
}
function createProgramSettings (target, {storage = deviceStorage(), changed = () => {}} = {}) {
    if (!target?.isStage) throw new Error('Arcade settings need the project Stage');
    let record = validated(target[PROPERTY]);
    if (!record) record = {version: VERSION, id: 'arcade-' + identity(), values: Object.create(null)};
    const key = 'brickwright.arcade.settings.v1.' + record.id;
    if (storage) {
        const text = storage.getItem(key);
        if (text !== null) {
            let saved;
            try { saved = validated(JSON.parse(text)); } catch (_) { /* named error below */ }
            if (!saved || saved.id !== record.id) throw new Error('Arcade device settings are malformed');
            record = saved;
        }
    }
    target[PROPERTY] = record;
    return {
        readNumber: name => Object.prototype.hasOwnProperty.call(record.values, String(name)) ?
            decode(record.values[String(name)]) : undefined,
        writeNumber: (name, value) => {
            if (typeof value !== 'number') throw new Error('Arcade number settings require a number');
            const values = Object.assign(Object.create(null), record.values);
            values[String(name)] = encode(value);
            const next = {...record, values};
            // A refused device write changes neither the project snapshot nor
            // the live record. The caller must report the actual storage error.
            if (storage) storage.setItem(key, JSON.stringify(next));
            record = next; target[PROPERTY] = record; changed();
        },
        mode: storage ? 'device-and-project' : 'project-snapshot',
        id: record.id
    };
}
function save (target, object) {
    if (!target.isStage) return;
    const record = validated(target[PROPERTY]);
    if (record) object[PROPERTY] = record;
}
function restore (object, target) {
    if (!object.isStage) return;
    const record = validated(object[PROPERTY]);
    if (record) target[PROPERTY] = record;
}
module.exports = {createProgramSettings, save, restore, validated};
