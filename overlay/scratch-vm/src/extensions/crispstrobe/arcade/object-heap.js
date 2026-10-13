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
    function definition(name) {
        live(); const def = classes.get(name);
        if (!def) throw new Error(`Class ${name} is not declared in this project run`);
        return def;
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
            Object.keys(spec).some(key => !['name', 'fields', 'initializer', 'constructor', 'parameters', 'methods'].includes(key)))
            throw new Error('Invalid class declaration');
        if (typeof spec.name !== 'string' || !/^[A-Za-z_]\w*$/.test(spec.name) || classes.has(spec.name))
            throw new Error('Invalid or duplicate class declaration name');
        if (!Array.isArray(spec.fields) || !Array.isArray(spec.parameters) || !Array.isArray(spec.methods))
            throw new Error('Class fields, parameters and methods must be declared');
        const validType=type=>typeof type==='string' && /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[\])*$/.test(type);
        const validParameters=params=>Array.isArray(params) && params.every(param=>param && /^[A-Za-z_]\w*$/.test(param.name||'') && validType(param.type) && typeof param.optional==='boolean' && Object.keys(param).every(key=>['name','type','optional'].includes(key))) && new Set(params.map(param=>param.name)).size===params.length;
        if(!validParameters(spec.parameters))throw new Error('Invalid declared constructor parameters');
        const fields = new Map(), methods = new Map();
        for (const field of spec.fields) {
            if (!field || typeof field.name !== 'string' || !/^[A-Za-z_]\w*$/.test(field.name) || fields.has(field.name) ||
                Object.keys(field).some(key => !['name', 'type', 'readonly'].includes(key)) ||
                !validType(field.type) || typeof field.readonly !== 'boolean') throw new Error('Invalid declared class field');
            fields.set(field.name, Object.freeze({...field}));
        }
        for (const method of spec.methods) {
            if (!method || typeof method.name !== 'string' || !/^[A-Za-z_]\w*$/.test(method.name) ||
                methods.has(method.name) || fields.has(method.name) || typeof method.procedure !== 'string' ||
                !validParameters(method.parameters) || !validType(method.returnType) ||
                Object.keys(method).some(key => !['name', 'procedure', 'parameters', 'returnType'].includes(key)))
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
    function set(ref, key, value, token) {
        const state = object(ref), field = state.def.fields.get(key);
        if (!field) throw new Error(`Unknown class field ${key}`);
        if (field.readonly && (state.construction !== token || token?.state !== state || token.generation !== generation))
            throw new Error(`Readonly class field ${key} may only be initialized by its constructor`);
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
