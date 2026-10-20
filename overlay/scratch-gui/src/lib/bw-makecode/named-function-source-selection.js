import {proveNamedFunctionSource} from './named-function-source.js';
import {lowerNamespaceBindings} from './namespace-bindings.js';
import {lowerStaticCallbackHelpers} from './static-callback-helpers.js';
import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
import {analyseCallableBindings} from './callable-bindings.js';

const metadata = new Set(['originalBody', 'parameterDefaults', 'paramTypes', 'typeParameters', 'returnType', 'assertedType']);
const path = node => node?.type === 'Identifier' ? node.name :
    node?.type === 'Member' ? `${path(node.object)}.${node.name}` : null;
const root = node => node?.type === 'Identifier' ? node :
    ['Member', 'Index'].includes(node?.type) ? root(node.object) : null;

function registrationOwnership(program) {
    const sdk = staticSdkNamespaceReceivers(program, {builtinIdentifiers: ['forever']});
    const mutated = new Set(), escaped = new Set();
    const visit = (node, parent = null) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {node.forEach(value => visit(value, parent));return;}
        const receiver = root(node);
        const owned = receiver && sdk.has(receiver);
        const written = node.type === 'Assignment' ? node.left : node.type === 'Update' ? node.argument : null;
        if (written && sdk.has(root(written))) mutated.add(root(written).name);
        if (node.type === 'Index' && owned) mutated.add(receiver.name);
        if (owned && ['Identifier', 'Member'].includes(node.type) &&
            !(['Member', 'Index'].includes(parent?.type) && parent.object === node) &&
            !(parent?.type === 'Call' && parent.callee === node)) escaped.add(path(node));
        for (const [key, value] of Object.entries(node)) if (!metadata.has(key)) visit(value, node);
    };
    visit(program);
    return node => {
        const name = path(node.callee), receiver = root(node.callee);
        return name && sdk.has(node.callee) && !mutated.has(receiver.name) &&
            ![...escaped].some(value => name === value || name.startsWith(`${value}.`));
    };
}

/** Select the stored declaration-value bridge without claiming procedure
 * references already consumed by the established static callback route.
 * This is a routing witness, never a callable producer or relaxed v3 proof.
 */
export function selectNamedFunctionSourceProof(program, {ordinaryProgram = program, registrationSpec} = {}) {
    const proof = proveNamedFunctionSource(program);
    if (proof.eligible || !proof.unsupported.length) return proof;

    const namespace = lowerNamespaceBindings(ordinaryProgram);
    if (namespace.unsupported.length) return proof;
    const legacyProgram = namespace.program || ordinaryProgram;
    const lexical = analyseCallableBindings(legacyProgram);
    for (const declaration of legacyProgram.body.filter(node => node.type === 'FunctionDeclaration')) {
        const binding = lexical.global.names.get(declaration.name);
        if (binding?.kind !== 'function' || binding.node !== declaration || binding.written ||
            legacyProgram.body.filter(node => node.name === declaration.name ||
                node.decls?.some(value => value.name === declaration.name)).length !== 1) return proof;
    }
    const ownedRegistration = registrationOwnership(legacyProgram);
    let unknownRegistration = false;
    const callbacks = lowerStaticCallbackHelpers(legacyProgram, {registrationSpec: (name, node) => {
        const spec = registrationSpec?.(name);
        if (!spec) return null;
        if (!ownedRegistration(node)) {unknownRegistration = true;return null;}
        return spec;
    }});
    if (unknownRegistration || callbacks.unsupported.length) return proof;
    const residual = proveNamedFunctionSource(callbacks.program);
    if (residual.eligible || residual.unsupported.length) return proof;

    // The actual existing lowerers consumed every declaration-value use.
    // Their normal pipeline still runs and validates the emitted program.
    return {eligible: false, unsupported: [], program, legacyProcedureRoute: true};
}
