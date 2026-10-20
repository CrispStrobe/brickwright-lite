// SPDX-License-Identifier: MPL-2.0
// Program-owned settings. SB3 carries identity and a portable snapshot;
// a device's localStorage, when available, holds its latest local records.
const codec=require('./settings-codec');
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
    let buffers;
    if(value.buffers!==undefined){
        if(!value.buffers || typeof value.buffers!=='object' || Array.isArray(value.buffers))return null;
        buffers=Object.create(null);
        for(const [key,text] of Object.entries(value.buffers)){
            if(!key.startsWith('S/') || typeof text!=='string' || text.length>65536 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text))return null;
            buffers[key]=text;
        }
    }
    return {version: VERSION, id: value.id, values,...(buffers?{buffers}:{})};
}
function deviceStorage () {
    try { return globalThis.localStorage || null; } catch (_) { return null; }
}
function createProgramSettings (target, {storage = deviceStorage(), changed = () => {}} = {}) {
    if (!target?.isStage) throw new Error('Arcade settings need the project Stage');
    let record = validated(target[PROPERTY]);
    if(Object.prototype.hasOwnProperty.call(target,PROPERTY) && target[PROPERTY]!==undefined && !record)throw new Error('Arcade project settings are malformed');
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
    const current=()=>{
        if(target[PROPERTY]!==record){
            const next=validated(target[PROPERTY]);
            if(!next || next.id!==record.id)throw new Error('Arcade project settings identity or snapshot changed');
            record=next;target[PROPERTY]=record;
        }
        return record;
    };
    const commit=next=>{
        // Device failure leaves both live values and the portable snapshot intact.
        if(storage)storage.setItem(key,JSON.stringify(next));
        record=next;target[PROPERTY]=record;changed();
    };
    const stateOf=record=>{
        const state=Object.assign(Object.create(null),record.buffers || {});
        for(const [name,value] of Object.entries(record.values))if(!Object.prototype.hasOwnProperty.call(state,'S/'+name))state['S/'+name]=codec.bytesToBase64(codec.packNumbers([decode(value)]));
        return state;
    };
    return {
        readNumber: name => {const record=current();return Object.prototype.hasOwnProperty.call(record.values,String(name))?decode(record.values[String(name)]):undefined;},
        writeNumber: (name,value) => {
            if(typeof value!=='number')throw new Error('Arcade number settings require a number');
            const record=current(),values=Object.assign(Object.create(null),record.values);values[String(name)]=encode(value);
            const next={...record,values};
            if(record.buffers){next.buffers=Object.assign(Object.create(null),record.buffers);next.buffers['S/'+name]=codec.bytesToBase64(codec.packNumbers([value]));}
            commit(next);
        },
        // Native public Settings uses genuine byte storage; each read returns
        // a fresh Buffer/array, as in PXT, rather than a mutable stored alias.
        call: (method,...args) => {
            const record=current(),state=stateOf(record),touched=new Set(),settings=codec.initialize(state,touched);
            const persist=()=>{
                if(!touched.size)return;
                const values=Object.assign(Object.create(null),record.values);
                for(const key of touched){const name=key.slice(2);delete values[name];
                    if(Object.prototype.hasOwnProperty.call(state,key)){const numbers=codec.unpackNumbers(codec.fromBase64(state[key]));if(numbers?.length)values[name]=encode(numbers[0]);}
                }
                commit({...record,values,buffers:state});
            };
            let result;
            try{result=settings[method](...args);}catch(error){
                // The original logical capacity failure clears user settings
                // before panic920. Device persistence errors remain transactional.
                if(error.settingsPanic===920)persist();
                throw error;
            }
            persist();return result;
        },
        mode: storage ? 'device-and-project' : 'project-snapshot',
        id: record.id
    };

}
function save (target, object) {
    if (!target.isStage) return;
    const record = validated(target[PROPERTY]);
    if(Object.prototype.hasOwnProperty.call(target,PROPERTY) && target[PROPERTY]!==undefined && !record)throw new Error('Arcade project settings are malformed');
    if (record) object[PROPERTY] = record;
}
function restore (object, target) {
    if (!object.isStage) return;
    const record = validated(object[PROPERTY]);
    if(Object.prototype.hasOwnProperty.call(object,PROPERTY) && !record)throw new Error('Arcade saved project settings are malformed');
    if (record) target[PROPERTY] = record;
}
module.exports = {createProgramSettings, save, restore, validated};
