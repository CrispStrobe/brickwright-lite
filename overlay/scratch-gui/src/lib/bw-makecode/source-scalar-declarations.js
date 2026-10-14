/** Directed scalar source flow. This inventory does not admit reference APIs. */
export function sourceScalarDeclarations(program) {
    const types = new Map(), edges = [], expressions = [], functions = new Map();
    const globals = new Map();
    const cells = new WeakMap();
    let sequence = 0;
    const add = (cell, type) => {
        if (!type) return false;
        if (!types.has(cell)) types.set(cell, new Set());
        const values = types.get(cell), before = values.size; values.add(type); return before !== values.size;
    };
    const edge = (from, to) => {if (from && to) edges.push([from, to]);};
    const global = name => `global:${name}`;
    const bind = (scope, name) => scope.locals.has(name) ? `${scope.key}:${name}` : global(name);
    for (const statement of program.body || []) {
        if (statement.type === 'Declaration') for (const declaration of statement.decls) globals.set(declaration.name, declaration);
        if (statement.type === 'FunctionDeclaration') functions.set(statement.name, statement);
    }
    const localNames = (body, locals) => {
        const walk = node => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) {node.forEach(walk);return;}
            if (['FunctionDeclaration','FunctionExpression','Class'].includes(node.type)) return;
            if (node.type === 'Declaration') for (const declaration of node.decls) locals.add(declaration.name);
            for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value);
        };
        walk(body); return locals;
    };
    const functionScopes = new Map([...functions].map(([name, fn]) => [name, {key: `function:${name}`, locals: localNames(fn.body,new Set(fn.params || []))}]));
    for (const [name, fn] of functions) {
        const scope = functionScopes.get(name);
        for (const parameter of fn.params || []) {
            const annotation=fn.paramTypes?.[parameter]?.text;
            if(annotation)add(`${scope.key}:${parameter}`, {number:'Number',boolean:'Boolean',string:'String'}[annotation] || 'Unknown');
        }
    }

    const visit = (node, scope) => {
        if (!node || typeof node !== 'object') return null;
        if (Array.isArray(node)) {node.forEach(value => visit(value, scope)); return null;}
        if (node.type === 'Identifier') return bind(scope, node.name);
        if (cells.has(node)) return cells.get(node);
        const cell = `expression:${++sequence}`; cells.set(node, cell);
        const primitive = {Number: 'Number', Boolean: 'Boolean', String: 'String', Undefined: 'Undefined', Null: 'Null'}[node.type];
        if (primitive) {add(cell, primitive); return cell;}
        if (node.type === 'Declaration') {
            for (const declaration of node.decls) {
                if (scope.key !== 'main') scope.locals.add(declaration.name);
                if(declaration.typeName && !['number','boolean','string'].includes(declaration.typeName))add(bind(scope,declaration.name),'Unknown');
                edge(visit(declaration.init, scope), bind(scope, declaration.name));
            }
        } else if (node.type === 'Assignment' && node.left?.type === 'Identifier') {
            const right = visit(node.right, scope), destination = bind(scope, node.left.name);
            if (node.op === '=') {edge(right, destination); edge(right, cell);}
            else if (node.op === '+=') {expressions.push({cell,left:destination,right});edge(cell,destination);}
            else {add(destination, 'Number'); add(cell, 'Number');}
        } else if (node.type === 'Update') {
            add(visit(node.argument,scope),'Number');add(cell,'Number');
        } else if (node.type === 'Return') {
            edge(visit(node.value, scope), `${scope.key}:result`);
        } else if (node.type === 'FunctionDeclaration') {
            const inner = functionScopes.get(node.name);
            if (inner) visit(node.body, inner);
        } else if (node.type === 'Class' || node.type === 'FunctionExpression') {
            // Separate class/reference and callback scope ownership stays intact.
            // Callback writes to globals are analyzed without aliasing parameters.
            if (node.type === 'FunctionExpression') visit(node.body, {key: `callback:${cell}`, locals: localNames(node.body,new Set(node.params || []))});
        } else if (node.type === 'Call') {
            const arguments_ = (node.args || []).map(argument => visit(argument, scope));
            const fn = node.callee?.type === 'Identifier' && functions.get(node.callee.name);
            if (fn && !node.isNew) {
                const inner = functionScopes.get(fn.name);
                arguments_.forEach((argument, index) => edge(argument, `${inner.key}:${fn.params[index]}`));
                edge(`${inner.key}:result`, cell);
            } else add(cell, 'Unknown');
        } else if (node.type === 'Binary' || node.type === 'Logical') {
            const left = visit(node.left, scope), right = visit(node.right, scope);
            if (['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(node.op)) add(cell, 'Boolean');
            else if (['&&', '||'].includes(node.op)) {edge(left, cell); edge(right, cell);}
            else if (node.op === '+') expressions.push({cell, left, right});
            else add(cell, 'Number');
        } else if (node.type === 'Conditional') {
            visit(node.test, scope); edge(visit(node.consequent, scope), cell); edge(visit(node.alternate, scope), cell);
        } else if (node.type === 'Unary') {
            visit(node.argument, scope); add(cell, node.op === '!' ? 'Boolean' : node.op === 'typeof' ? 'String' : 'Number');
        } else if (node.type === 'Array' || node.type === 'Member' || node.type === 'Index' || node.type === 'Template') {
            add(cell, 'Unknown');
        } else {
            for (const value of Object.values(node)) if (value && typeof value === 'object') visit(value, scope);
        }
        return cell;
    };
    visit(program.body, {key: 'main', locals: new Set()});
    let changed;
    do {
        changed = false;
        for (const [from, to] of edges) for (const type of types.get(from) || []) changed = add(to, type) || changed;
        for (const {cell, left, right} of expressions) {
            const a = types.get(left), b = types.get(right);
            if (!a?.size || !b?.size) continue;
            for (const x of a) for (const y of b) changed = add(cell, x === 'String' || y === 'String' ? 'String' : x === 'Unknown' || y === 'Unknown' ? 'Unknown' : 'Number') || changed;
        }
    } while (changed);
    const declarations = [];
    for (const [name, declaration] of globals) {
        if (declaration.temporary || declaration.isArray) continue;
        const declared = {number: 'Number', boolean: 'Boolean', string: 'String', any: 'Any'}[declaration.typeName];
        const inferred = [...(types.get(global(name)) || [])].filter(type => type !== 'Undefined' && type !== 'Null');
        if (declared) declarations.push({name, type: declared});
        else if (inferred.length && inferred.every(type => ['Number', 'Boolean', 'String'].includes(type))) declarations.push({name, type: inferred.length === 1 ? inferred[0] : 'Any'});
    }
    return declarations;
}
