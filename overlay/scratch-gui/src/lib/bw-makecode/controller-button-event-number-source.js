import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';
import {analyseCallableBindings} from './callable-bindings.js';

// These are the existing controller event payloads, not a general SDK enum table.
// Source emission and the selected ordinary caller proof use the same values.
export const BUTTON_EVENTS = Object.freeze({Pressed:2049, Released:2048, Repeated:2054});

const metadata = new Set(['originalBody','parameterDefaults','paramTypes','typeParameters','returnType','assertedType','bwProcedureConstraintSource']);
const path = node => node?.type === 'Identifier' ? node.name :
    node?.type === 'Member' ? `${path(node.object)}.${node.name}` : null;

/** Actual readonly builtin leaves in a deliberately closed source slice.
 * Lexical namespace classification alone does not prove absence of effects.
 * Unknown calls/receivers, ambient handles and dynamic access remain refused;
 * even safe programs using those forms are outside this first bounded proof.
 */
export function controllerButtonEventNumberLeaves(program) {
    const sdk = staticSdkNamespaceReceivers(program), lexical = analyseCallableBindings(program);
    const nodes = [], parents = new WeakMap(), declarations = new Map(), candidates = [], seen = new WeakSet();
    let sharedExecutableNode = false;
    const collect = (node, parent = null) => {
        if (!node || typeof node !== 'object') return;
        // Shared executable containers or leaves cannot have two source parents.
        // Checking before array traversal also terminates cyclic containers.
        if (seen.has(node)) {sharedExecutableNode = true;return;}
        seen.add(node);
        if (Array.isArray(node)) {node.forEach(value => collect(value, parent));return;}
        nodes.push(node);parents.set(node, parent);
        for (const [key, value] of Object.entries(node)) if (!metadata.has(key)) collect(value, node);
    };
    collect(program);
    const count = binding => {if (binding) declarations.set(binding, (declarations.get(binding) || 0) + 1);};
    for (const node of nodes) {
        const scope = lexical.scopes.get(node);
        if (node.type === 'FunctionDeclaration') count(scope?.parent?.names.get(node.name));
        else if (['Class','Enum'].includes(node.type)) count(scope?.names.get(node.name));
        else if (node.type === 'Declaration') for (const decl of node.decls) count(scope?.names.get(decl.name));
    }
    const buttonCall = node => node?.type === 'Call' && !node.isNew && !node.constructorCall &&
        !node.typeArguments?.length && node.args.length === 2 && !node.args.some(value => value?.type === 'Spread') &&
        sdk.has(node.callee) && /^controller\.(?:A|B|up|down|left|right)\.onEvent$/.test(path(node.callee) || '') &&
        node.args[1]?.type === 'FunctionExpression' && node.args[1].params.length === 0;
    let unsafe = sharedExecutableNode;
    for (const node of nodes) {
        const parent = parents.get(node);
        if (node.type === 'Unknown' || node.type === 'Index' || node.type === 'Identifier' &&
            ['globalThis','window','self','eval','Function','Reflect','arguments','this'].includes(node.name)) unsafe = true;
        if (node.type === 'Identifier' && ['controller','ControllerButtonEvent'].includes(node.name) && sdk.has(node) &&
            !(parent?.type === 'Member' && parent.object === node)) unsafe = true;
        if (node.type === 'Identifier') {
            const binding = lexical.references.get(node);
            if (binding?.kind === 'function' && !(parent?.type === 'Call' && parent.callee === node)) unsafe = true;
        }
        if (node.type === 'Member') {
            const enumLeaf = node.object?.type === 'Identifier' && node.object.name === 'ControllerButtonEvent' &&
                sdk.has(node) && Object.hasOwn(BUTTON_EVENTS, node.name);
            const receiver = /^controller\.(?:A|B|up|down|left|right)$/.test(path(node) || '') && sdk.has(node) &&
                parent?.type === 'Member' && parent.object === node && parent.name === 'onEvent' && buttonCall(parents.get(parent));
            const registration = buttonCall(parent) && parent.callee === node;
            if (enumLeaf) candidates.push(node);
            if (!enumLeaf && !receiver && !registration) unsafe = true;
            if (parent?.type === 'Assignment' && parent.left === node || parent?.type === 'Update' && parent.argument === node ||
                parent?.type === 'Unary' && parent.op === 'delete') unsafe = true;
        }
        if (node.type === 'Assignment' || node.type === 'Update' || node.type === 'Unary' && node.op === 'delete') {
            let target = node.type === 'Assignment' ? node.left : node.argument;
            while (['Member','Index'].includes(target?.type)) target = target.object;
            if (target?.type === 'Identifier' && sdk.has(target) && ['controller','ControllerButtonEvent'].includes(target.name)) unsafe = true;
        }
        if (node.type === 'Call' && !buttonCall(node)) {
            const binding = node.callee?.type === 'Identifier' ? lexical.references.get(node.callee) : null;
            if (node.isNew || node.constructorCall || node.typeArguments?.length || node.args.some(value => value?.type === 'Spread') ||
                binding?.kind !== 'function' || binding.written || declarations.get(binding) !== 1 ||
                binding.node?.type !== 'FunctionDeclaration') unsafe = true;
        }
    }
    return new WeakSet(unsafe ? [] : candidates);
}
