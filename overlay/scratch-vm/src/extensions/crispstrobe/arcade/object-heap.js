/* Explicit class instances. Declarative definitions may be serialized; mutable
 * fields stay in this runtime's heap and travel only as BWValues references. */
let nextHeap = 0;
module.exports = function createObjectHeap(runtime, values) {
    const heapId = ++nextHeap;
    let generation = 0, nextObject = 0, disposed = false, closed = false;
    const classes = new Map(), objects = new Map();
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const reset = () => { generation++; classes.clear(); objects.clear(); };
    const suspend = () => { disposed = true; reset(); };
    const loaded = () => { if (!closed) { disposed = false; reset(); } };
    const dispose = () => {
        closed = true; suspend();
        runtime?.off?.('PROJECT_START', reset);runtime?.off?.('PROJECT_LOADED', loaded);runtime?.off?.('RUNTIME_DISPOSED', suspend);
    };
    runtime?.on?.('PROJECT_START', reset);runtime?.on?.('PROJECT_LOADED', loaded);runtime?.on?.('RUNTIME_DISPOSED', suspend);
    function live() { if (disposed) throw new Error('Class object heap is disposed'); }
    function definition(name,seen=new Set()) {
        live(); const def = classes.get(name);
        if (!def) throw new Error(`Class ${name} is not declared in this project run`);
        if (!def.parent) return def;
        if (seen.has(name)) throw new Error('Cyclic class inheritance');
        seen.add(name);const base=definition(def.parent,seen);
        for(const field of def.fields.keys())if(base.fields.has(field))throw new Error('Redefinition of inherited class field '+field);
        return Object.freeze({...def,fields:new Map([...base.fields,...def.fields]),methods:new Map([...base.methods,...def.methods])});
    }
    function object(ref) {
        live(); const id = values.referenceId(runtime, ref, 'object');
        const state = id !== null && objects.get(id);
        if (!state || state.generation !== generation) throw new Error('Unknown or stale class object reference');
        return state;
    }
    function hold(value) {
        value = values.encode(values.decode(value));
        if (Array.isArray(value)) return values.arrayReference(runtime, value);
        if (values.isReference(value)) {
            if (values.referenceId(runtime, value, value.bwReference.kind) === null)
                throw new Error('Unknown or stale class field reference');
            if (value.bwReference.kind === 'object') object(value);
        } else if ((value && typeof value === 'object' && value !== values.UNDEFINED) || typeof value === 'function') {
            throw new Error('Class field requires a primitive or registered reference value');
        }
        return value;
    }
    function register(spec) {
        live();
        if (!spec || typeof spec !== 'object' || Array.isArray(spec) ||
            Object.keys(spec).some(key => !['name', 'parent', 'fields', 'initializer', 'constructor', 'parameters', 'methods'].includes(key)))
            throw new Error('Invalid class declaration');
        if (typeof spec.name !== 'string' || !/^[A-Za-z_]\w*$/.test(spec.name) || classes.has(spec.name))
            throw new Error('Invalid or duplicate class declaration name');
        if (spec.parent!==undefined && (typeof spec.parent!=='string' || !/^[A-Za-z_]\w*$/.test(spec.parent)))throw new Error('Invalid class parent name');
        if (!Array.isArray(spec.fields) || !Array.isArray(spec.parameters) || !Array.isArray(spec.methods))
            throw new Error('Class fields, parameters and methods must be declared');
        const validType=type=>typeof type==='string' && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[\])*$/.test(type);
        const validParameters=params=>Array.isArray(params) && params.every(param=>param && /^[A-Za-z_]\w*$/.test(param.name||'') && validType(param.type) && typeof param.optional==='boolean' && (param.default===undefined || param.optional && (param.default===null || typeof param.default==='boolean' || typeof param.default==='number'&&Number.isFinite(param.default))) && Object.keys(param).every(key=>['name','type','optional','default'].includes(key))) && new Set(params.map(param=>param.name)).size===params.length;
        if(!validParameters(spec.parameters))throw new Error('Invalid declared constructor parameters');
        const fields = new Map(), methods = new Map();
        for (const field of spec.fields) {
            if (!field || typeof field.name !== 'string' || !/^[A-Za-z_]\w*$/.test(field.name) || fields.has(field.name) ||
                Object.keys(field).some(key => !['name', 'type', 'readonly', 'visibility', 'initializer', 'parameterProperty'].includes(key)) ||
                field.parameterProperty!==undefined && typeof field.parameterProperty!=='boolean' || field.initializer!==undefined && typeof field.initializer!=='string' || !validType(field.type) || typeof field.readonly !== 'boolean' || field.visibility !== undefined && !['public','private','protected'].includes(field.visibility)) throw new Error('Invalid declared class field');
            fields.set(field.name, Object.freeze({...field}));
        }
        for (const method of spec.methods) {
            if (!method || typeof method.name !== 'string' || !/^[A-Za-z_]\w*$/.test(method.name) ||
                methods.has(method.name) || fields.has(method.name) || typeof method.procedure !== 'string' ||
                !validParameters(method.parameters) || !validType(method.returnType) || method.visibility !== undefined && !['public','private','protected'].includes(method.visibility) ||
                Object.keys(method).some(key => !['name', 'procedure', 'parameters', 'returnType', 'visibility'].includes(key)))
                throw new Error('Invalid declared class method');
            methods.set(method.name, Object.freeze({...method, parameters: Object.freeze([...method.parameters])}));
        }
        for (const name of ['initializer', 'constructor']) if (!own(spec, name) || typeof spec[name] !== 'string')
            throw new Error('Class initializer and constructor procedure names must be explicit');
        const def = Object.freeze({...spec, fields, methods, parameters: Object.freeze([...spec.parameters])});
        classes.set(spec.name, def); return def;
    }
    function allocate(name) {
        const def = definition(name), id = `object:${heapId}:${generation}:${++nextObject}`;
        const ref = values.reference(runtime, 'object', id);
        const state = {ref, def, generation, fields: new Map([...def.fields.keys()].map(key => [key, values.UNDEFINED]))};
        const token = Object.freeze({state, generation});
        state.construction = token; objects.set(id, state); return {ref, def, token};
    }
    function finish(ref, token) {
        const state = object(ref);
        if (state.construction !== token) throw new Error('Class constructor no longer owns this object');
        state.construction = null; return ref;
    }
    function abort(ref, token) {
        const id = values.referenceId(runtime, ref, 'object'), state = objects.get(id);
        if (state?.construction === token) objects.delete(id);
    }
    function get(ref, key) {
        const state = object(ref);
        if (!state.fields.has(key)) throw new Error(`Unknown class field ${key}`);
        return state.fields.get(key);
    }
    function set(ref, key, value) {
        const state = object(ref), field = state.def.fields.get(key);
        if (!field) throw new Error(`Unknown class field ${key}`);
        // readonly/visibility are TypeScript declaration checks, not runtime
        // immutability. Construction tokens still own allocation completion.
        state.fields.set(key, hold(value));
    }
    function method(ref, name) {
        const found = object(ref).def.methods.get(name);
        if (!found) throw new Error(`Unknown class method ${name}`);
        return found;
    }
    return {register, definition, allocate, finish, abort, get, set, method, hold, reset, dispose,
        constructionActive(ref,token) {try{return object(ref).construction===token && token.generation===generation;}catch{return false;}},
        inspect(ref) { const state = object(ref); return {className: state.def.name, constructing: !!state.construction}; }};
};
