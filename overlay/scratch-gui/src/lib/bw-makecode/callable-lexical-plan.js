import {callableDefaultBody} from './callable-defaults.js';

// Inert source-derived lexical provenance for the unadmitted callable bridge.
// Procedure blocks remain the executable/export body authority; no source body
// or JavaScript function is serialized into this plan.
const identifier = value => typeof value === 'string' && /^[A-Za-z_]\w*$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error('Callable lexical plan: ' + message); };
const keys = (value, allowed) => {
    if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('unknown or malformed fields');
};
const id = value => { if (!identifier(value)) fail('invalid identity'); };
const type = value => {
    if (!object(value)) fail('missing concrete signature type');
    if (value.kind === 'named') {
        keys(value, ['kind', 'name']);
        if (!['number', 'string', 'boolean', 'void', 'null', 'undefined'].includes(value.name))
            fail('unqualified named capture/signature type ' + value.name);
    } else if (value.kind === 'callable') {
        keys(value, ['kind', 'parameters', 'result']);
        if (!Array.isArray(value.parameters)) fail('missing parameter signature');
        const names = new Set();
        let optional = false;
        for (const parameter of value.parameters) {
            keys(parameter, ['name', 'optional', 'type']); id(parameter.name);
            if (names.has(parameter.name) || typeof parameter.optional !== 'boolean' || optional && !parameter.optional)
                fail('invalid ordered parameter signature');
            names.add(parameter.name); optional ||= parameter.optional; type(parameter.type);
        }
        type(value.result);
    } else fail('unqualified capture/signature type');
};
const unique = (rows, label) => {
    if (!Array.isArray(rows)) fail('missing ' + label);
    const result = new Map();
    for (const row of rows) {
        id(row?.id);
        if (result.has(row.id)) fail('duplicate ' + label + ' identity');
        result.set(row.id, row);
    }
    return result;
};
const sameType = (left, right) => left.kind === right.kind && (left.kind === 'named' ? left.name === right.name :
    left.parameters.length === right.parameters.length && left.parameters.every((parameter, index) =>
        parameter.optional === right.parameters[index].optional && sameType(parameter.type, right.parameters[index].type)) &&
    sameType(left.result, right.result));
const validateDefaults = (defaults, signature) => {
    if (!Array.isArray(defaults)) fail('missing literal default profile');
    const names = new Set();
    for (const entry of defaults) {
        keys(entry, ['name', 'value']);
        if (!signature.parameters.some(parameter => parameter.name === entry.name) || names.has(entry.name) ||
            !(entry.value === null || typeof entry.value === 'boolean' || typeof entry.value === 'number' &&
                Number.isFinite(entry.value) && !Object.is(entry.value, -0))) fail('unqualified literal default');
        names.add(entry.name);
    }
};
export function validateCallableLexicalPlan(plan) {
    keys(plan, ['schema', 'version', 'module', 'owners', 'bindings', 'sites']);
    if (plan.schema !== 'bw-callable-lexical' || ![1, 3].includes(plan.version)) fail('unsupported schema version');
    const owners = unique(plan.owners, 'owner'), bindings = unique(plan.bindings, 'binding'), sites = unique(plan.sites, 'site');
    const module = owners.get(plan.module);
    if (!module || module.kind !== 'module' || module.parent !== null) fail('missing module owner');
    const procedures = new Set();
    const namedPlan = plan.version === 3;
    for (const owner of owners.values()) {
        keys(owner, ['id', 'kind', 'parent', 'sourceName', 'procedure', 'signature', 'parameters', 'defaults', ...(plan.version===3?['origin']:[])]);
        if (!(plan.version===3?['module','declaration']:['module','declaration','arrow','function']).includes(owner.kind)) fail('unqualified lexical owner kind');
        if (owner.kind === 'module') {
            if (owner !== module || owner.parent !== null || Object.keys(owner).length !== 3) fail('duplicate or malformed module');
            continue;
        }
        if (!owners.has(owner.parent) || (owner.kind === 'declaration' ? !identifier(owner.sourceName) : owner.sourceName !== null) ||
            typeof owner.procedure !== 'string' || !owner.procedure)
            fail('missing lexical parent or procedure');
        if (procedures.has(owner.procedure)) fail('duplicate procedure ownership');
        procedures.add(owner.procedure); type(owner.signature);
        if(namedPlan && (!object(owner.origin)||Object.keys(owner.origin).some(key=>!['kind','path'].includes(key))||
            !['module','namespace'].includes(owner.origin.kind)||typeof owner.origin.path!=='string'||
            !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(owner.origin.path)||owner.parent!==plan.module||
            owner.parameters?.length||owner.signature.parameters?.length||owner.signature.result?.kind!=='named'||
            !['number','string','void'].includes(owner.signature.result.name)))fail('invalid actual named declaration origin or signature');
        if (owner.signature.kind !== 'callable' || !Array.isArray(owner.parameters) ||
            owner.parameters.length !== owner.signature.parameters.length) fail('procedure signature mismatch');
        validateDefaults(owner.defaults, owner.signature);
        let current = owner, seen = new Set();
        while (current !== module) {
            if (!current || seen.has(current.id)) fail('cyclic lexical owner');
            seen.add(current.id); current = owners.get(current.parent);
        }
    }
    for (const binding of bindings.values()) {
        keys(binding, ['id', 'owner', 'sourceName', 'nativeName', 'kind', 'declarationKind', 'type', 'written', ...(namedPlan?['targets']:[])]);
        if (!owners.has(binding.owner) || !identifier(binding.sourceName) || !identifier(binding.nativeName) ||
            !['global', 'local', 'parameter', 'function'].includes(binding.kind) || typeof binding.written !== 'boolean')
            fail('invalid lexical binding');
        if (['global', 'local'].includes(binding.kind) && !['let', 'const', 'var'].includes(binding.declarationKind))
            fail('missing declaration syntax');
        if (!['global', 'local'].includes(binding.kind) && binding.declarationKind !== undefined) fail('unexpected declaration syntax');
        type(binding.type);
        if(namedPlan && binding.type.kind==='callable' && (!Array.isArray(binding.targets)||
            binding.kind!=='function'&&!binding.targets.length||new Set(binding.targets).size!==binding.targets.length||
            binding.targets.some(id=>!sites.has(id)||!sameType(owners.get(sites.get(id).owner).signature,binding.type))))fail('named callable binding lacks actual declaration targets');
        if(namedPlan && binding.type.kind!=='callable' && binding.targets!==undefined)fail('primitive binding has declaration targets');
    }
    for (const owner of owners.values()) {
        for (const [index, bindingId] of (owner.parameters || []).entries()) {
            const binding = bindings.get(bindingId), parameter = owner.signature.parameters[index];
            if (!binding || binding.owner !== owner.id || binding.kind !== 'parameter' || binding.sourceName !== parameter.name ||
                !sameType(binding.type, parameter.type)) fail('parameter binding mismatch');
        }
        const names = new Set();
        for (const binding of bindings.values()) if (binding.owner === owner.id) {
            if (names.has(binding.nativeName)) fail('duplicate native binding');
            names.add(binding.nativeName);
        }
    }
    for (const site of sites.values()) {
        keys(site, ['id', 'owner', 'createdIn', 'captures', 'defaults']);
        const owner = owners.get(site.owner);
        if (!owner || !(namedPlan?['declaration']:['arrow','function']).includes(owner.kind) || owner.parent !== site.createdIn || !Array.isArray(site.captures))
            fail('creation owner mismatch');
        if(namedPlan && (site.captures.length||site.defaults.length))fail('named labels do not allocate captures/defaults');
        const seen = new Set();
        for (const capture of site.captures) {
            keys(capture, ['binding', 'mode']);
            const binding = bindings.get(capture.binding);
            if (!binding || binding.owner === plan.module || seen.has(capture.binding) ||
                capture.mode !== (binding.written ? 'cell' : 'value')) fail('capture cell/mode mismatch');
            seen.add(capture.binding);
            let ancestor = owners.get(owner.parent);
            while (ancestor && ancestor.id !== binding.owner) ancestor = owners.get(ancestor.parent);
            if (!ancestor) fail('foreign capture owner');
        }
        validateDefaults(site.defaults, owner.signature);
        if (JSON.stringify(site.defaults) !== JSON.stringify(owner.defaults)) fail('site/owner default mismatch');
    }
    return plan;
}

export function createCallableLexicalPlan(flow, siteInfos) {
    const {lexical} = flow, owners = new Map(), bindings = new Map();
    const scopeId = scope => 'scope_' + scope.id, bindingId = binding => 'binding_' + binding.id;
    const nativeName = binding => binding.kind === 'parameter' ? binding.name : binding.cellName;
    const sitesByScope = new Map(siteInfos.map(info => [info.scope, info]));
    const declarationKinds = new WeakMap();
    const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (node.type === 'Declaration') for (const declaration of node.decls) declarationKinds.set(declaration, node.kind);
        for (const [key, value] of Object.entries(node)) if (!['originalBody', 'parameterDefaults', 'paramTypes', 'typeParameters'].includes(key)) walk(value);
    };
    walk(lexical.global.node);
    const addOwner = scope => {
        if (owners.has(scope)) return;
        if (scope === lexical.global) { owners.set(scope, {id: scopeId(scope), kind: 'module', parent: null}); return; }
        if (!['function'].includes(scope.kind)) fail('unqualified lexical block/class owner');
        addOwner(scope.parent);
        const info = sitesByScope.get(scope), signature = flow.signature(flow.profiles.get(scope.node));
        if (!signature) fail('unresolved lexical owner signature');
        const kind = scope.node.type === 'FunctionDeclaration' ? 'declaration' : scope.node.functionKind;
        if (!['declaration', 'arrow', 'function'].includes(kind)) fail('missing actual function syntax');
        const defaults = callableDefaultBody(scope.node);
        if (defaults.unsupported.length) fail(defaults.unsupported.join('; '));
        const name = info?.name || scope.node.name;
        if (!identifier(name)) fail('missing source procedure identity');
        owners.set(scope, {id: scopeId(scope), kind, parent: scopeId(scope.parent), sourceName: kind === 'declaration' ? scope.node.name : null,
            procedure: name + scope.node.params.map(() => ' %s').join(''), signature: structuredClone(signature),
            parameters: scope.node.params.map(name => bindingId(scope.names.get(name))), defaults: structuredClone(defaults.defaults)});
    };
    for (const info of siteInfos) addOwner(info.scope);
    for (const binding of lexical.bindings) {
        if (!owners.has(binding.scope)) continue;
        const targets = flow.bindingTargets.get(binding);
        const relevantGlobal = binding.kind === 'function' && owners.has(lexical.scopes.get(binding.node)) ||
            targets?.size && [...targets].some(target => sitesByScope.has(lexical.scopes.get(target)));
        if (binding.scope === lexical.global && !relevantGlobal) continue;
        const signature = flow.bindingTypes.get(binding) || (binding.kind === 'function' ? flow.signature(flow.profiles.get(binding.node)) : null);
        if (!signature) fail('unresolved lexical binding ' + binding.name);
        bindings.set(binding, {id: bindingId(binding), owner: scopeId(binding.scope), sourceName: binding.name,
            nativeName: nativeName(binding), kind: binding.kind, ...(declarationKinds.has(binding.node) ? {declarationKind: declarationKinds.get(binding.node)} : {}),
            type: structuredClone(signature), written: binding.written});
    }
    const sites = siteInfos.map(info => ({id: info.site, owner: scopeId(info.scope), createdIn: scopeId(info.scope.parent),
        captures: info.scope.captureSpecifications.map(capture => ({binding: bindingId(capture.binding), mode: capture.mode})),
        defaults: structuredClone(info.defaults)}));
    return validateCallableLexicalPlan({schema: 'bw-callable-lexical', version: 1, module: scopeId(lexical.global),
        owners: [...owners.values()], bindings: [...bindings.values()], sites});
}
