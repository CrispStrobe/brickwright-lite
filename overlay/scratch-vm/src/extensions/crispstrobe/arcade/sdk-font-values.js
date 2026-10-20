// Live Font records use the unchanged licensed PXT text implementation.
// This owned first slice permits reads; public mutation needs its own gate.
const initializeText = require('./text-pxt');
const buffers = require('./buffer');
let nextOwner = 0;
const FIELDS = new Set(['charWidth', 'charHeight', 'data', 'multiplier']);
// Mirrors sdk-font-value-descriptors.js. This is a record role, not an SDK class.
const FONT_RECORD_NAME='__bwSDK_Font';
const FIELD_SPECIFICATIONS=Object.freeze([
    Object.freeze({name:'charWidth',type:'number',readonly:false,visibility:'public'}),
    Object.freeze({name:'charHeight',type:'number',readonly:false,visibility:'public'}),
    Object.freeze({name:'data',type:'Buffer',readonly:false,visibility:'public'}),
    Object.freeze({name:'multiplier',type:'number',readonly:false,visibility:'public',optional:true})
]);
const DEFINITION=Object.freeze({name:FONT_RECORD_NAME,intrinsic:'Font',record:true,
    constructible:false,inheritable:false,initializer:'',constructor:'',parameters:Object.freeze([]),
    fields:new Map(FIELD_SPECIFICATIONS.map(field=>[field.name,Object.freeze({...field,native:true})])),methods:new Map()});
const RESOURCE_MANIFEST = Object.freeze({
    target: 'pxt-common-packages/v14.1.4',
    textSHA256: '2ff6f11be61e3953a316ab3655c405861aaac3d76043ed88da02b535fa159a33',
    font12ResourceSHA256: '2347313d1a7022d77108da534d3cc2f661a25c0af64befb3a139675ab0b8b46e'
});
function create(runtime, values, bufferOwner, {managedStart = false} = {}) {
    const bufferReference=bufferOwner?.reference,resolveBuffer=bufferOwner?.resolve;
    if (!runtime || typeof runtime.on !== 'function' || typeof bufferReference !== 'function' || typeof resolveBuffer !== 'function')
        throw new Error('SDK Font needs its actual runtime and Buffer owner');
    if (nextOwner >= Number.MAX_SAFE_INTEGER) throw new RangeError('SDK Font owner limit reached');
    const owner = ++nextOwner;
    let epoch = 0, next = 0, suspended = false, closed = false, text;
    let records, ids, glyphViews;
    const glyphStorage=new WeakMap();
    const live = () => {
        if (closed || suspended) throw new Error('SDK Font owner is disposed or stopped');
        if(bufferOwner.reference!==bufferReference || bufferOwner.resolve!==resolveBuffer)
            throw new Error('SDK Font Buffer owner changed');
    };
    const key = ref => values.referenceId(runtime, ref, 'object');
    const reset = () => {
        if (closed) return;
        epoch++; next = 0; suspended = false;
        records = new Map(); ids = new WeakMap(); glyphViews = new WeakMap(); text=null;
    };
    const initialize=()=>{
        live();if(text)return text;
        text = initializeText({control: {createBuffer: size => new buffers.PxtBuffer(size)},
            NumberFormat: buffers.NumberFormat,
            hex: strings => buffers.literal(String(strings.raw ? strings.raw[0] : strings[0]).replace(/\s/g, '')),
            base64: data => {
                // The simulator's compiled JRES hex literal reports static,
                // but its setNumber operation still writes the backing bytes.
                const body=buffers.fromBase64(data);
                Object.defineProperty(body,'isStatic',{value:true});return body;
            }});
        for(const name of ['font5','font8','font12']){const data=text.image[name].data;
            const spans=glyphStorage.get(data.buffer)||[];spans.push([data.byteOffset,data.byteOffset+data.byteLength]);glyphStorage.set(data.buffer,spans);}
        return text;
    };
    const suspend = () => {suspended = true; records?.clear();};
    const reference = record => {
        live();
        let ref = ids.get(record);
        if (!ref) {
            ref = values.reference(runtime, 'object', `font:${owner}:${epoch}:${++next}`);
            ids.set(record, ref); records.set(key(ref), record);
        }
        return ref;
    };
    const resolve = ref => {
        live(); const record = records.get(key(ref));
        if (!record) throw new Error('SDK Font record is foreign, stale or unavailable');
        return record;
    };
    const glyphReference = data => {
        if (!ArrayBuffer.isView(data) || data.BYTES_PER_ELEMENT !== 1)
            throw new Error('SDK Font glyph storage is not a qualified byte Buffer');
        let view = glyphViews.get(data);
        if (!view) {
            // A view preserves the actual glyph storage; it is not a copied asset.
            view = new buffers.PxtBuffer(data.buffer, data.byteOffset, data.byteLength);
            Object.defineProperty(view,'isStatic',{value:data.isStatic===true});
            glyphViews.set(data, view);
        }
        const ref = bufferReference(view);
        const id = values.referenceId(runtime, ref, 'buffer');
        if (id === null || resolveBuffer(ref)!==view)
            throw new Error('SDK Font glyph Buffer owner did not retain the actual canonical storage');
        const spans=glyphStorage.get(view.buffer)||[];
        if(!spans.some(span=>span[0]===view.byteOffset && span[1]===view.byteOffset+view.byteLength))
            spans.push([view.byteOffset,view.byteOffset+view.byteLength]);
        glyphStorage.set(view.buffer,spans);return ref;
    };
    reset();
    if(!managedStart)runtime.on('PROJECT_START', reset); runtime.on('PROJECT_LOADED', reset);
    const dispose=()=>service.dispose();
    runtime.on('PROJECT_STOP_ALL', suspend); runtime.on('RUNTIME_DISPOSED', dispose);
    const service={
        // The integrated startup coordinator resets before implicit text hosts.
        startProgram() {
            if(!managedStart || closed)throw new Error('SDK Font startup owner is unavailable');
            reset();
        },
        matches:()=>false,
        isDisposed:()=>closed,
        resourceManifest: RESOURCE_MANIFEST,
        constant(name) {
            live(); if (!['font5', 'font8', 'font12'].includes(name)) throw new Error('Unknown SDK Font constant');
            return reference(initialize().image[name]);
        },
        forText(value) {
            live(); if (typeof value !== 'string') throw new Error('SDK Font selection needs actual String text');
            return reference(initialize().image.getFontForText(value));
        },
        scale(ref, size) {
            live(); if (typeof size !== 'number') throw new Error('SDK Font scaling needs actual Number size');
            const record=resolve(ref);return reference(initialize().image.scaledFont(record, size));
        },
        read(ref, field) {
            if (!FIELDS.has(field)) throw new Error('Unknown SDK Font field');
            const record = resolve(ref), value = record[field];
            return field === 'data' ? glyphReference(value) : values.encode(value);
        },
        write() {throw new Error('SDK Font field mutation is not qualified in the read slice');},
        guardBufferMutation(ref) {
            if(bufferOwner.reference!==bufferReference || bufferOwner.resolve!==resolveBuffer)throw new Error('SDK Font Buffer owner changed');
            const body=resolveBuffer(ref);
            const spans=glyphStorage.get(body.buffer)||[];
            if (spans.some(([start,end])=>body.byteOffset<end && body.byteOffset+body.byteLength>start))
                throw new Error('SDK Font glyph Buffer mutation is not qualified in the read slice');
        },
        owns(ref) {return !closed && !suspended && records.has(key(ref));},
        // Internal adapter entry: printing must consume this exact live record.
        resolve,
        textModule() {return initialize();},
        print(image, value, x, y, color, ref) {
            const record=resolve(ref);initialize().helpers.imagePrint(image, value, x, y, color, record);
        },
        printCenter(image, value, y, color, ref) {
            const record=resolve(ref);initialize().helpers.imagePrintCenter(image, value, y, color, record);
        },
        dispose() {
            if (closed) return; closed = true; suspend();
            runtime.off('PROJECT_START', reset); runtime.off('PROJECT_LOADED', reset);
            runtime.off('PROJECT_STOP_ALL', suspend); runtime.off('RUNTIME_DISPOSED', dispose);
        }
    };
    service.heapHooks={
        definition:name=>name===FONT_RECORD_NAME?DEFINITION:null,
        external:ref=>service.owns(ref),
        externalClass(ref){resolve(ref);return FONT_RECORD_NAME;},
        get:(ref,field)=>service.read(ref,field),
        set:()=>service.write(),
        reserve(){throw new Error('SDK Font is an interface record and cannot be constructed or inherited');}
    };
    return service;
}
module.exports = {create, RESOURCE_MANIFEST, FIELD_SPECIFICATIONS, FONT_RECORD_NAME};
