import {createRequire} from 'node:module';
const require = createRequire(new URL('../../packages/scratch-gui/package.json', import.meta.url));
const parse = source => require('@babel/parser').parse(source, {sourceType:'script'});
const shape = node => JSON.stringify(node,(key,value) =>
    ['start','end','loc','extra','leadingComments','trailingComments','innerComments'].includes(key) ? undefined : value);
const statement = source => parse('function expected() {'+source+'}').program.body[0].body.body[0];
const same = (actual,expected) => shape(actual)===shape(expected);
const fulfilled = 'if (bwArcadeExceptions.stale(sequencer.runtime, thread, bwExceptionLease)) return;';
const rejected = 'if (bwArcadeExceptions.consume(sequencer.runtime, thread, rejectionReason) || bwArcadeExceptions.stale(sequencer.runtime, thread, bwExceptionLease)) return;';
const capture = 'const bwExceptionLease = bwArcadeExceptions.capture(sequencer.runtime, thread);';
const catcher = 'try {} catch (error) {if (!bwArcadeExceptions.consume(sequencer.runtime, thread, error)) throw error;}';

// Inspect executable nodes rather than accepting a marker in a comment/string.
export function patchArcadeExceptions(source) {
    const ast = parse(source), wrappers = [], promises = [], imports = [];
    const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'FunctionExpression' && node.id?.name === 'executeWithContext') wrappers.push(node);
        if (node.type === 'VariableDeclarator' && node.id?.name === 'handlePromise') promises.push(node.init);
        if (node.type === 'VariableDeclarator' && node.id?.name === 'bwArcadeExceptions') imports.push(node);
        for (const [key,value] of Object.entries(node)) if (!['loc','comments','tokens','extra'].includes(key)) {
            if (Array.isArray(value)) value.forEach(visit);else if (value && typeof value === 'object') visit(value);
        }
    };
    visit(ast.program);
    if (wrappers.length !== 1 || promises.length !== 1 || promises[0]?.type !== 'ArrowFunctionExpression')
        throw new Error('execute.js Arcade exception wrappers missing or ambiguous');
    const wrapper = wrappers[0], promise = promises[0];
    if (!ast.program.body.some(node => node.type==='ExpressionStatement' &&
        node.expression.type==='AssignmentExpression' && node.expression.operator==='=' &&
        node.expression.left.type==='MemberExpression' && !node.expression.left.computed &&
        node.expression.left.object.name==='module' && node.expression.left.property.name==='exports' &&
        node.expression.right===wrapper) || wrapper.params.map(node=>node.name).join(',')!=='sequencer,thread')
        throw new Error('execute.js Arcade exception export is not the actual context wrapper');
    const guarded = wrapper.body.body.find(node => node.type === 'TryStatement');
    const then = promise.body.body.find(node => node.type === 'ExpressionStatement' &&
        node.expression.type === 'CallExpression' && node.expression.callee?.object?.name === 'primitiveReportedValue' &&
        node.expression.callee?.property?.name === 'then')?.expression;
    if (!guarded?.finalizer || !then || then.arguments.length !== 2 ||
        then.arguments.some(node => node.type !== 'ArrowFunctionExpression' || node.body.type !== 'BlockStatement'))
        throw new Error('execute.js Arcade exception settlement shape changed');
    if (imports.length) {
        const module = imports[0]?.init;
        const lease = promise.body.body.filter(node => node.type==='VariableDeclaration' &&
            node.declarations.some(declaration=>declaration.id?.name==='bwExceptionLease'));
        if (imports.length !== 1 || !ast.program.body.some(node=>node.type==='VariableDeclaration' &&
                node.kind==='const' && node.declarations.length===1 && node.declarations[0]===imports[0]) ||
            module?.callee?.name !== 'require' || module.arguments.length!==1 ||
            module.arguments[0]?.value !== '../util/bw-arcade-exceptions' ||
            !same(guarded.handler,statement(catcher).handler) ||
            !same(then.arguments[0].body.body[0],statement(fulfilled)) ||
            !same(then.arguments[1].body.body[0],statement(rejected)) ||
            lease.length!==1 || !same(lease[0],statement(capture)))
            throw new Error('execute.js Arcade exception hooks incomplete');
        return source;
    }
    if (guarded.handler) throw new Error('execute.js already has an unknown exceptional completion handler');
    const edits = [
        [0, "const bwArcadeExceptions = require('../util/bw-arcade-exceptions');\n"],
        [guarded.block.end,
            ' catch (error) {\n        if (!bwArcadeExceptions.consume(sequencer.runtime, thread, error)) throw error;\n    }'],
        [then.arguments[0].body.start + 1, '\n        '+fulfilled],
        [then.arguments[1].body.start + 1, '\n        '+rejected],
        [then.start, capture+'\n    ']
    ];
    // The insertion point is the end of the try body. Whitespace and the
    // existing finally remain byte-for-byte intact.
    for (const [offset,text] of edits.sort((a,b) => b[0]-a[0])) source = source.slice(0,offset)+text+source.slice(offset);
    parse(source);
    return patchArcadeExceptions(source);
}
