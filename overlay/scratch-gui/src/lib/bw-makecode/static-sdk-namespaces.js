import {ARCADE_NAMESPACE_MEMBERS} from './arcade-namespace-members.js';

/** Static SDK namespace receivers are names, not runtime objects to snapshot.
 * An optional explicitly selected builtin identifier uses the same lexical rules.
 * Resolve them at each lexical use; a parameter or local with the same name
 * remains an ordinary receiver. This classification does not admit any API.
 */
export function staticSdkNamespaceReceivers(program, {builtinIdentifiers = []} = {}) {
    const references = new WeakSet();
    const namespaces = new Set([...Object.keys(ARCADE_NAMESPACE_MEMBERS).map(name => name.split('.')[0]), ...builtinIdentifiers]);
    const declarations = statements => {
        const names = new Set();
        for (const statement of statements || []) {
            if (statement.type === 'Declaration') for (const declaration of statement.decls) names.add(declaration.name);
            if (['FunctionDeclaration', 'Class', 'Enum'].includes(statement.type)) names.add(statement.name);
        }
        return names;
    };
    const functionVariables = statements => {
        const names = new Set();
        const visit = node => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) { node.forEach(visit); return; }
            if (['FunctionDeclaration', 'FunctionExpression', 'Class'].includes(node.type)) return;
            if (node.type === 'Declaration' && node.kind === 'var') {
                for (const declaration of node.decls) names.add(declaration.name);
            }
            Object.values(node).forEach(visit);
        };
        visit(statements); return names;
    };
    const receiverRoot = node => node?.type === 'Identifier' ? node.name :
        node?.type === 'Member' ? receiverRoot(node.object) : null;
    const body = (statements, outer, parameters = [], functionScope = false) => {
        const scope = new Set([...outer, ...parameters, ...declarations(statements),
            ...(functionScope ? functionVariables(statements) : [])]);
        for (const statement of statements || []) visit(statement, scope);
    };
    const visit = (node, scope) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { for (const child of node) visit(child, scope); return; }
        const root = receiverRoot(node);
        if (root && namespaces.has(root) && !scope.has(root)) references.add(node);
        if (node.type === 'Program' || node.type === 'Block' || node.type === 'Namespace') {
            body(node.body, scope, [], node.type !== 'Block'); return;
        }
        if (['FunctionDeclaration', 'FunctionExpression'].includes(node.type)) {
            body(node.body, scope, node.params || [], true); return;
        }
        if (node.type === 'Class') {
            for (const method of [...(node.methods || []), ...(node.ctor ? [node.ctor] : [])]) {
                body(method.body, scope, method.params || [], true);
            }
            for (const field of node.fields || []) visit(field.init, scope);
            return;
        }
        if (node.type === 'If') {
            visit(node.test, scope); body(node.consequent, scope); body(node.alternate, scope); return;
        }
        if (['For', 'While', 'ForOf'].includes(node.type)) {
            const loop = new Set([...scope, ...declarations(node.init ? [node.init] : [])]);
            if (node.type === 'ForOf') loop.add(node.name);
            visit(node.init, loop); visit(node.test, loop); visit(node.update, loop); visit(node.iterable, loop);
            body(node.body, loop); return;
        }
        if (node.type === 'Switch') {
            visit(node.discriminant, scope);
            const statements = (node.cases || []).flatMap(branch => branch.body || []);
            const inner = new Set([...scope, ...declarations(statements)]);
            for (const branch of node.cases || []) { visit(branch.test, inner); body(branch.body, inner); }
            return;
        }
        for (const value of Object.values(node)) visit(value, scope);
    };
    visit(program, new Set());
    return references;
}
