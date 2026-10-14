/* Explicit class instances. Declarative definitions may be serialized; mutable
 * fields stay in this runtime's heap and travel only as BWValues references. */
let nextHeap = 0;
module.exports = function createObjectHeap(runtime, values, native = {}) {
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
        live(); const def = classes.get(name) || native.definition?.(name);
        if (!def) throw new Error(`Class ${name} is not declared in this project run`);
        if (!def.parent) return def;
        if (seen.has(name)) throw new Error('Cyclic class inheritance');
        seen.add(name);const base=definition(def.parent,seen);
        const fields=new Map(base.fields);
        for(const [name,field]of def.fields){const inherited=fields.get(name);if(inherited){
            if(!(field.getter||field.setter) || !(inherited.getter||inherited.setter))throw new Error('Redefinition of inherited class field '+name);
            fields.set(name,Object.freeze({...field,getter:field.getter||inherited.getter,setter:field.setter||inherited.setter}));
        }else fields.set(name,field);}
        const methods=new Map([...base.methods,...def.methods]);
        if([...fields.keys()].some(name=>methods.has(name)))throw new Error('Inherited class field/accessor conflicts with a method');
        return Object.freeze({...def,intrinsic:def.intrinsic || base.intrinsic,fields,methods});
    }
    const referenceKey = ref => values.isReference(ref) ? values.referenceId(runtime,ref,'object') : native.external?.(ref) ? ref : null;
    function object(ref) {
        live(); const external = native.external?.(ref), id = referenceKey(ref);
        let state = id !== null && objects.get(id);
        if (!state && external) {const def=definition(native.externalClass(ref));state={ref,def,generation,construction:null,fields:new Map([...def.fields].filter(([,field])=>!field.getter&&!field.setter).map(([key])=>[key,values.UNDEFINED]))};objects.set(id,state);}
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
        if (typeof spec.name !== 'string' || !/^[A-Za-z_]\w*$/.test(spec.name) || (classes.has(spec.name) || native.definition?.(spec.name)))
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
                Object.keys(field).some(key => !['name', 'type', 'readonly', 'visibility', 'initializer', 'parameterProperty', 'getter', 'setter', 'valueKind', 'callableSignature'].includes(key)) ||
                field.parameterProperty!==undefined && typeof field.parameterProperty!=='boolean' || field.initializer!==undefined && typeof field.initializer!=='string' || !validType(field.type) || typeof field.readonly !== 'boolean' || field.visibility !== undefined && !['public','private','protected'].includes(field.visibility)) throw new Error('Invalid declared class field');
            if(field.getter!==undefined && (typeof field.getter!=='string'||!field.getter) || field.setter!==undefined && (!field.setter || typeof field.setter.procedure!=='string' || !field.setter.procedure || !validParameters(field.setter.parameters) || field.setter.parameters.length!==1 || field.setter.parameters[0].optional || Object.hasOwn(field.setter.parameters[0],'default') || Object.keys(field.setter).some(key=>!['procedure','parameters'].includes(key))))throw new Error('Invalid class accessor descriptor');
            if((field.getter||field.setter) && (field.initializer!==undefined || field.parameterProperty || field.readonly!==!!(field.getter&&!field.setter)))throw new Error('Class accessor must retain its declared halves without a backing initializer');
            const callableField=field.valueKind==='callable';
            if(field.valueKind!==undefined&&!callableField || callableField!==(field.callableSignature!==undefined) || callableField &&
                (field.type!=='callable'||field.getter||field.setter||typeof native.callableSignature!=='function'||typeof native.callableField!=='function'))
                throw new Error('Class callable field requires its explicit owned signature service');
            fields.set(field.name, Object.freeze({...field,
                ...(field.callableSignature!==undefined?{callableSignature:native.callableSignature(field.callableSignature)}:{}),
                ...(field.setter?{setter:Object.freeze({...field.setter,parameters:Object.freeze(field.setter.parameters.map(param=>Object.freeze({...param})))})}:{})}));
        }
        for (const method of spec.methods) {
            const callableMethod=method && (method.callableSignature!==undefined||method.typeParameters!==undefined||
                method.parameters?.some?.(parameter=>parameter?.callableSignature!==undefined));
            if (!method || typeof method.name !== 'string' || !/^[A-Za-z_]\w*$/.test(method.name) ||
                methods.has(method.name) || fields.has(method.name) || typeof method.procedure !== 'string' ||
                (callableMethod?typeof native.callableMethod!=='function':!validParameters(method.parameters)) || !validType(method.returnType) || method.visibility !== undefined && !['public','private','protected'].includes(method.visibility) ||
                Object.keys(method).some(key => !['name', 'procedure', 'parameters', 'returnType', 'visibility', 'typeParameters', 'callableSignature'].includes(key)))
                throw new Error('Invalid declared class method');
            const normalised=callableMethod?native.callableMethod(method):method;
            methods.set(method.name, Object.freeze({...normalised, parameters: Object.freeze([...normalised.parameters])}));
        }
        for (const name of ['initializer', 'constructor']) if (!own(spec, name) || typeof spec[name] !== 'string')
            throw new Error('Class initializer and constructor procedure names must be explicit');
        const accessorCodes=[...fields.values()].flatMap(field=>[field.getter,field.setter?.procedure].filter(Boolean));
        const ordinaryCodes=[spec.initializer,spec.constructor,...[...methods.values()].map(method=>method.procedure)];
        const priorCodes=[...classes.values()].flatMap(cls=>[cls.initializer,cls.constructor,...[...cls.methods.values()].map(method=>method.procedure),...[...cls.fields.values()].flatMap(field=>[field.getter,field.setter?.procedure].filter(Boolean))]);
        if([...classes.values()].some(cls=>[...cls.fields.values()].some(field=>[field.getter,field.setter?.procedure].filter(Boolean).some(code=>ordinaryCodes.includes(code)))) || new Set(accessorCodes).size!==accessorCodes.length || accessorCodes.some(code=>ordinaryCodes.includes(code)||priorCodes.includes(code)))throw new Error('Class accessor procedure must belong to exactly one declared half');
        const def = Object.freeze({...spec, fields, methods, parameters: Object.freeze([...spec.parameters])});
        classes.set(spec.name, def); return def;
    }
    function allocate(name) {
        const def = definition(name), ref = def.intrinsic ? native.reserve(def) : values.reference(runtime,'object',`object:${heapId}:${generation}:${++nextObject}`);
        const id=referenceKey(ref);if(id===null)throw new Error('Native class allocation requires a current canonical reference');
        const state = {ref, def, generation, fields: new Map([...def.fields].filter(([,field])=>!field.getter&&!field.setter).map(([key])=>[key,values.UNDEFINED]))};
        const token = Object.freeze({state, generation});
        state.construction = token; objects.set(id, state); return {ref, def, token};
    }
    function finish(ref, token) {
        const state = object(ref);
        if (state.construction !== token) throw new Error('Class constructor no longer owns this object');
        state.construction = null; return ref;
    }
    function abort(ref, token) {
        const id = referenceKey(ref), state = objects.get(id);
        if (state?.construction === token) objects.delete(id);
    }
    function get(ref, key) {
        const state = object(ref);
        if (!state.def.fields.has(key)) throw new Error(`Unknown class field ${key}`);
        if(state.def.fields.get(key).getter || state.def.fields.get(key).setter)throw new Error('Class accessor read requires its managed getter');
        return state.def.fields.get(key)?.native ? native.get(ref,key) : state.fields.get(key);
    }
    function set(ref, key, value, _token, util) {
        const state = object(ref), field = state.def.fields.get(key);
        if (!field) throw new Error(`Unknown class field ${key}`);
        if(field.getter || field.setter)throw new Error('Class accessor write requires its managed setter');
        // readonly/visibility are TypeScript declaration checks, not runtime
        // immutability. Construction tokens still own allocation completion.
        if(field.native)return native.set(ref,key,hold(value),util);
        const held=hold(value);
        if(field.callableSignature!==undefined)native.callableField(field.callableSignature,held);
        state.fields.set(key, held);
    }
    function method(ref, name) {
        const found = object(ref).def.methods.get(name);
        if (!found) throw new Error(`Unknown class method ${name}`);
        return found;
    }
    return {register, definition, allocate, finish, abort, get, set, method, hold, reset, dispose,
        property(ref,name) {const field=object(ref).def.fields.get(name);if(!field)throw new Error('Unknown class field '+name);return field;},
        constructionActive(ref,token) {try{return object(ref).construction===token && token.generation===generation;}catch{return false;}},
        inspect(ref) { const state = object(ref); return {className: state.def.name, constructing: !!state.construction}; }};
};
