// Lower PXT fiber code to generators, for the native Arcade runtime.
//
// PXT runs programs on fibers: pause() suspends the caller and
// control.runInParallel starts another fiber. The native runtime has no fibers,
// so generation lowers exactly that: a function that pauses, or calls such a
// function, becomes a generator and those calls become yield*; a callback given
// to control.runInParallel becomes a generator function. Every other line is the
// original source. A pausing call anywhere else throws.
export function lowerFibers(ts, source, fileName) {
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2018, true);

    const nameOf = node => node.name && ts.isIdentifier(node.name) ? node.name.text : null;
    const isParallelCall = node => ts.isCallExpression(node) && node.expression.getText() === 'control.runInParallel';
    // Namespaces declared by these files; `music.f(...)` calls the namespace function f.
    const namespaces = new Set();
    const collect = node => {
        if (ts.isModuleDeclaration(node)) namespaces.add(node.name.getText());
        ts.forEachChild(node, collect);
    };
    collect(sourceFile);
    // Callee name of a call: `f(...)` and `music.f(...)` -> f, `x.m(...)` -> .m
    const calleeKey = call => ts.isIdentifier(call.expression) ? call.expression.text :
        !ts.isPropertyAccessExpression(call.expression) ? null :
        namespaces.has(call.expression.expression.getText()) ? call.expression.name.text : '.' + call.expression.name.text;
    const functions = [];
    const visit = node => {
        if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) functions.push(node);
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    // Calls made directly by a function body, not by nested functions or callbacks.
    const directCalls = fn => {
        const calls = [];
        const walk = node => {
            if (node !== fn && (ts.isFunctionLike(node))) return;
            if (ts.isCallExpression(node)) calls.push(node);
            ts.forEachChild(node, walk);
        };
        ts.forEachChild(fn, walk);
        return calls;
    };
    const asyncKeys = new Set(['pause']);
    let changed = true;
    while (changed) {
        changed = false;
        for (const fn of functions) {
            const key = ts.isMethodDeclaration(fn) ? '.' + nameOf(fn) : nameOf(fn);
            if (!key || asyncKeys.has(key)) continue;
            if (directCalls(fn).some(call => asyncKeys.has(calleeKey(call)))) { asyncKeys.add(key); changed = true; }
        }
    }
    const isAsyncFunction = fn => asyncKeys.has(ts.isMethodDeclaration(fn) ? '.' + nameOf(fn) : nameOf(fn));
    // A pausing call inside a plain callback cannot be lowered.
    const problems = [];
    const check = (node, inside) => {
        if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
            const parallel = isParallelCall(node.parent);
            ts.forEachChild(node, child => check(child, parallel ? 'parallel' : 'plain'));
            return;
        }
        if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
            ts.forEachChild(node, child => check(child, isAsyncFunction(node) ? 'async' : 'sync'));
            return;
        }
        if (ts.isCallExpression(node) && asyncKeys.has(calleeKey(node)) && !['async', 'parallel'].includes(inside))
            problems.push(`${calleeKey(node)} at ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        ts.forEachChild(node, child => check(child, inside));
    };
    check(sourceFile, 'sync');
    if (problems.length) throw new Error(`pausing calls outside a lowered function: ${problems.join(', ')}`);

    const lower = context => {
        const f = context.factory;
        const visitor = node => {
            if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && isAsyncFunction(node)) {
                const body = ts.visitEachChild(node.body, visitor, context);
                return ts.isFunctionDeclaration(node) ?
                    f.updateFunctionDeclaration(node, node.modifiers, f.createToken(ts.SyntaxKind.AsteriskToken), node.name,
                        node.typeParameters, node.parameters, node.type, body) :
                    f.updateMethodDeclaration(node, node.modifiers, f.createToken(ts.SyntaxKind.AsteriskToken), node.name,
                        node.questionToken, node.typeParameters, node.parameters, node.type, body);
            }
            if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && isParallelCall(node.parent)) {
                const visited = ts.visitNode(node.body, visitor);
                const body = ts.isBlock(visited) ? visited : f.createBlock([f.createExpressionStatement(visited)], true);
                const generator = f.createFunctionExpression(undefined, f.createToken(ts.SyntaxKind.AsteriskToken), undefined,
                    undefined, node.parameters, undefined, body);
                // An arrow keeps its `this`.
                return f.createCallExpression(f.createPropertyAccessExpression(f.createParenthesizedExpression(generator), 'bind'),
                    undefined, [f.createThis()]);
            }
            if (ts.isCallExpression(node) && asyncKeys.has(calleeKey(node))) {
                return f.createParenthesizedExpression(f.createYieldExpression(f.createToken(ts.SyntaxKind.AsteriskToken),
                    ts.visitEachChild(node, visitor, context)));
            }
            return ts.visitEachChild(node, visitor, context);
        };
        return file => ts.visitNode(file, visitor);
    };
    const lowered = ts.transform(sourceFile, [lower]).transformed[0];
    const printed = ts.createPrinter().printFile(lowered);
    return {printed, asyncKeys: [...asyncKeys].sort()};
}
