// Invocation-local class/callable type authority. This module does not admit
// source syntax or execute callbacks; the caller must own the resource/frame.
module.exports = function createClassCallableTypes(runtime, values, heap, signatureOf, sdkImages) {
    const primitive = new Set(['number','string','boolean','void','null','undefined']);
    const fail = message => { throw new Error('Class callable type: ' + message); };
    const ownKeys = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
        Object.keys(value).every(key => names.includes(key));
    const same = (left, right) => left.kind === right.kind && (['named','sdk'].includes(left.kind) ? left.name === right.name :
        left.parameters.length === right.parameters.length && left.parameters.every((parameter, index) =>
            parameter.optional === right.parameters[index].optional && same(parameter.type, right.parameters[index].type)) &&
        same(left.result, right.result));
    function ordinary(name) {
        let definition = heap.definition(name); const seen = new Set();
        while (definition) {
            if (seen.has(definition.name) || definition.intrinsic) fail('requires ordinary managed class ancestry');
            seen.add(definition.name);
            definition = definition.parent ? heap.definition(definition.parent) : null;
        }
    }
    function validate(type, generics = new Set()) {
        const kindDescriptor = type && typeof type === 'object' && Object.getOwnPropertyDescriptor(type, 'kind');
        if (kindDescriptor && !Object.prototype.hasOwnProperty.call(kindDescriptor, 'value')) fail('malformed signature');
        if (kindDescriptor?.value === 'sdk') {
            const descriptors = Object.getOwnPropertyDescriptors(type);
            if (Reflect.ownKeys(descriptors).length !== 2 || !descriptors.kind || !descriptors.name ||
                !Object.prototype.hasOwnProperty.call(descriptors.kind, 'value') ||
                !Object.prototype.hasOwnProperty.call(descriptors.name, 'value') || descriptors.name.value !== 'Image' ||
                !sdkImages || typeof sdkImages.assert !== 'function') fail('unqualified SDK signature domain');
            return {kind:'sdk',name:'Image'};
        }
        if (!ownKeys(type, type?.kind === 'named' ? ['kind','name'] : ['kind','parameters','result'])) fail('malformed signature');
        if (type.kind === 'named') {
            if (typeof type.name !== 'string' || !/^[A-Za-z_]\w*$/.test(type.name) || ['any','unknown'].includes(type.name)) fail('opaque signature domain');
            if (!primitive.has(type.name) && !generics.has(type.name)) ordinary(type.name);
        } else if (type.kind === 'callable') {
            if (!Array.isArray(type.parameters)) fail('missing ordered parameters');
            const names = new Set();
            for (const parameter of type.parameters) {
                if (!ownKeys(parameter, ['name','type','optional']) || !/^[A-Za-z_]\w*$/.test(parameter.name || '') ||
                    names.has(parameter.name) || parameter.optional !== false) fail('unqualified callback parameter');
                names.add(parameter.name); validate(parameter.type, generics);
            }
            validate(type.result, generics);
        } else fail('unqualified signature domain');
        return structuredClone(type);
    }
    function actual(value) {
        // The codec restores transports. Prove an Image's original exact shape
        // before restoration can discard malformed extra transport fields.
        if (sdkImages && value && typeof value === 'object') {
            const transport = Object.getOwnPropertyDescriptor(value, 'bwReference');
            if (!transport && 'bwReference' in value) fail('malformed reference transport');
            if (transport) {
                if (!Object.prototype.hasOwnProperty.call(transport, 'value')) fail('malformed reference transport');
                const kind = transport.value && Object.getOwnPropertyDescriptor(transport.value, 'kind');
                if (!kind || !Object.prototype.hasOwnProperty.call(kind, 'value')) fail('malformed reference transport');
                if (kind?.value === 'image') {sdkImages.assert(value); return {kind:'sdk',name:'Image'};}
            }
        }
        const decoded = values.decode(value);
        if (values.isReference(decoded)) {
            if (values.referenceId(runtime, decoded, decoded.bwReference.kind) === null) fail('foreign reference');
            if (decoded.bwReference.kind === 'image') {
                if (!sdkImages || typeof sdkImages.assert !== 'function') fail('unqualified reference domain');
                sdkImages.assert(decoded); return {kind:'sdk',name:'Image'};
            }
            if (decoded.bwReference.kind === 'object') {
                const name = heap.inspect(decoded).className; ordinary(name); return {kind:'named',name};
            }
            if (decoded.bwReference.kind === 'callable') {
                if (typeof signatureOf !== 'function') fail('missing owned callable signature');
                const signature = validate(signatureOf(decoded));
                if (signature.kind !== 'callable') fail('missing owned callable signature');
                return signature;
            }
            fail('unqualified reference domain');
        }
        if (decoded === null) return {kind:'named',name:'null'};
        if (['number','string','boolean','undefined'].includes(typeof decoded)) return {kind:'named',name:typeof decoded};
        fail('opaque runtime value');
    }
    function instantiate(signature, typeParameters, args) {
        if (!Array.isArray(typeParameters) || !Array.isArray(args)) fail('missing ordered invocation');
        const generics = new Set();
        for (const parameter of typeParameters) {
            if (!ownKeys(parameter, ['name','constraint','defaultType']) || !/^[A-Za-z_]\w*$/.test(parameter.name || '') ||
                generics.has(parameter.name) || parameter.constraint !== '' || parameter.defaultType !== '') fail('unqualified generic parameter');
            generics.add(parameter.name);
        }
        validate(signature, generics);
        if (signature.kind !== 'callable' || args.length !== signature.parameters.length) fail('argument arity differs');
        const substitutions = new Map();
        const bind = (expected, supplied, signatureResult=false) => {
            if (expected.kind === 'named' && generics.has(expected.name)) {
                if (supplied.kind === 'named' && (['null','undefined'].includes(supplied.name)||supplied.name==='void'&&!signatureResult)) fail('generic inference requires concrete input');
                const previous = substitutions.get(expected.name);
                if (previous && !same(previous, supplied)) fail('generic inputs disagree');
                substitutions.set(expected.name, supplied); return;
            }
            if (expected.kind !== supplied.kind) fail('argument structure differs');
            if (expected.kind === 'sdk') {
                if (expected.name !== supplied.name) fail('SDK argument type differs');
                return;
            }
            if (expected.kind === 'named') {
                if (expected.name === supplied.name) return;
                if (!primitive.has(expected.name) && !primitive.has(supplied.name)) {
                    let row = heap.definition(supplied.name);
                    while (row.parent) { row = heap.definition(row.parent); if (row.name === expected.name) return; }
                }
                fail('argument type differs');
            }
            if (expected.parameters.length !== supplied.parameters.length) fail('callback arity differs');
            expected.parameters.forEach((parameter, index) => {
                // Callable parameter types are invariant in this bounded ABI.
                // Nominal subtyping applies to actual object arguments only.
                const input = supplied.parameters[index];
                if (parameter.optional !== input.optional || !same(parameter.type, input.type)) fail('callback parameter type differs');
            });
            bind(expected.result, supplied.result,true);
        };
        signature.parameters.forEach((parameter, index) => bind(parameter.type, actual(args[index])));
        const substitute = type => {
            if (type.kind === 'sdk') return {...type};
            if (type.kind === 'named') {
                if (!generics.has(type.name)) return {...type};
                if (!substitutions.has(type.name)) fail('unresolved generic result');
                return structuredClone(substitutions.get(type.name));
            }
            return {...type,parameters:type.parameters.map(parameter => ({...parameter,type:substitute(parameter.type)})),result:substitute(type.result)};
        };
        return validate(substitute(signature));
    }
    function result(signature, value) {
        validate(signature);
        if (signature.kind !== 'callable') fail('missing invocation signature');
        if (signature.result.kind === 'named' && signature.result.name === 'void') return value;
        instantiate({kind:'callable',parameters:[{name:'result',optional:false,type:signature.result}],result:{kind:'named',name:'void'}}, [], [value]);
        return value;
    }
    return Object.freeze({validate,actual,instantiate,result});
};
