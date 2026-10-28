#!/usr/bin/env node
// Retain original public Buffer helpers; adapt PXT indexed reads to getByte.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const bundle = JSON.parse(readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/target.json')));
const source = bundle.bundledpkgs.base['buffer.ts'];
const parsed = ts.createSourceFile('buffer.ts', source, ts.ScriptTarget.Latest, true);
const namespace = parsed.statements.find(node => ts.isModuleDeclaration(node) && node.name.text === 'helpers');
if (!namespace || !ts.isModuleBlock(namespace.body)) throw new Error('Pinned Buffer helper namespace changed');
const names = new Set(['bufferConcat', 'bufferEquals', 'bufferIndexOf', 'bufferToArray', 'bufferToBase64', 'bufferChunked', 'bufferUnpack', 'bufferPackAt']);
const selected = namespace.body.statements.filter(node => ts.isFunctionDeclaration(node) && names.delete(node.name.text));
if (names.size) throw new Error('Missing pinned Buffer helper: ' + [...names].join(', '));
const alphabet = namespace.body.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.text === '_b64'));
if (!alphabet) throw new Error('Missing pinned Base64 alphabet');
selected.unshift(alphabet);
const bufferNamespace = parsed.statements.find(node => ts.isModuleDeclaration(node) && node.name.text === 'Buffer');
const bufferFunctions = new Set(['sizeOfNumberFormat', 'fromArray', 'concat', 'b64Idx', 'fromBase64Core', 'fromBase64', 'chunkLen', 'chunkedFromUTF8', 'packedSize', 'pack', 'getFormat', 'isDigit', '__packUnpackCore']);
const staticFunctions = bufferNamespace?.body?.statements?.filter(node => ts.isFunctionDeclaration(node) && bufferFunctions.delete(node.name.text));
if (bufferFunctions.size) throw new Error('Missing pinned Buffer static functions: ' + [...bufferFunctions].join(', '));
const input = 'namespace helpers {\n' + selected.map(node => node.getFullText(parsed)).join('\n') + '\n}' +
    '\nnamespace Buffer {\n' + staticFunctions.map(node => node.getFullText(parsed)).join('\n') + '\n}';
const bufferNames = new Set(['a', 'b', 'l', 'r', 'buf']);
let indexedReads = 0, indexedWrites = 0, indexedStringReads = 0, integerDivisions = 0, boundedChunkPushes = 0, boundedPackLoops = 0, boundedNumberPushes = 0, packBudgets = 0;
let currentFunction = null;
const indexedReadTransformer = context => {
    const visit = node => {
        if (ts.isFunctionDeclaration(node)) {
            const previous = currentFunction;
            currentFunction = node.name.text;
            let result = ts.visitEachChild(node, visit, context);
            if (currentFunction === '__packUnpackCore') {
                packBudgets++;
                const budget = context.factory.createVariableStatement(undefined, context.factory.createVariableDeclarationList([
                    context.factory.createVariableDeclaration('packSteps', undefined, undefined, context.factory.createNumericLiteral(0))
                ], ts.NodeFlags.Let));
                result = context.factory.updateFunctionDeclaration(result, result.modifiers, result.asteriskToken,
                    result.name, result.typeParameters, result.parameters, result.type,
                    context.factory.updateBlock(result.body, [budget, ...result.body.statements]));
            }
            currentFunction = previous;
            return result;
        }
        if (currentFunction === '__packUnpackCore' && ts.isWhileStatement(node) &&
            ts.isPostfixUnaryExpression(node.expression) && node.expression.operand.getText() === 'reps') {
            boundedPackLoops++;
            const body = ts.visitNode(node.statement, visit);
            const step = context.factory.createExpressionStatement(context.factory.createCallExpression(
                context.factory.createIdentifier('guardPackStep'), undefined,
                [context.factory.createPrefixUnaryExpression(ts.SyntaxKind.PlusPlusToken, context.factory.createIdentifier('packSteps'))]));
            return context.factory.updateWhileStatement(node,
                context.factory.createCallExpression(context.factory.createIdentifier('guardPackRepeat'), undefined, [node.expression]),
                context.factory.updateBlock(body, [step, ...body.statements]));
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const target = node.expression.expression.getText();
            if (currentFunction === '__packUnpackCore' && target === 'nums' && node.expression.name.text === 'push') {
                if (node.arguments.length !== 1) throw new Error('Unpack result push changed');
                boundedNumberPushes++;
                return context.factory.createCallExpression(context.factory.createIdentifier('pushNumber'), undefined,
                    [node.expression.expression, context.factory.createArrowFunction(undefined, undefined, [], undefined,
                        context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.visitNode(node.arguments[0], visit))]);
            }
            if (node.expression.name.text === 'idiv' && target === 'Math') {
                integerDivisions++;
                return context.factory.createCallExpression(context.factory.createIdentifier('idiv'), undefined,
                    node.arguments.map(argument => ts.visitNode(argument, visit)));
            }
            if (node.expression.name.text === 'push' &&
                ((currentFunction === 'bufferChunked' && target === 'r') ||
                 (currentFunction === 'chunkedFromUTF8' && target === 'chunks'))) {
                if (node.arguments.length !== 1) throw new Error('Chunk collection push changed');
                boundedChunkPushes++;
                return context.factory.createCallExpression(context.factory.createIdentifier('pushChunk'), undefined,
                    [node.expression.expression, context.factory.createArrowFunction(undefined, undefined, [], undefined,
                        context.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.visitNode(node.arguments[0], visit))]);
            }
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isElementAccessExpression(node.left) && ts.isIdentifier(node.left.expression) && ['buf', 'trg'].includes(node.left.expression.text)) {
            indexedWrites++;
            return context.factory.createCallExpression(
                context.factory.createPropertyAccessExpression(node.left.expression, 'setByte'), undefined,
                [ts.visitNode(node.left.argumentExpression, visit), ts.visitNode(node.right, visit)]);
        }
        const visited = ts.visitEachChild(node, visit, context);
        if (ts.isElementAccessExpression(node)) {
            // bytes is the ordinary number[] parameter, not a PXT Buffer.
            if (ts.isIdentifier(node.expression) && ['bytes', 'nums'].includes(node.expression.text)) return visited;
            if ((ts.isIdentifier(node.expression) && ['b64', 'format'].includes(node.expression.text)) ||
                (ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText() === 'helpers' && node.expression.name.text === '_b64') ||
                (ts.isIdentifier(node.expression) && node.expression.text === '_b64')) {
                indexedStringReads++;
                return context.factory.createCallExpression(context.factory.createPropertyAccessExpression(visited.expression, 'charAt'), undefined, [visited.argumentExpression]);
            }
            if (!ts.isIdentifier(node.expression) || !bufferNames.has(node.expression.text))
                throw new Error('Unexpected indexed access in selected Buffer helper');
            indexedReads++;
            return context.factory.createCallExpression(
                context.factory.createPropertyAccessExpression(visited.expression, 'getByte'),
                undefined, [visited.argumentExpression]);
        }
        return visited;
    };
    return node => ts.visitNode(node, visit);
};
const compiled = ts.transpileModule(input, {compilerOptions: {target: ts.ScriptTarget.ES2018},
    transformers: {before: [indexedReadTransformer]}, reportDiagnostics: true});
if (indexedReads !== 9 || indexedWrites !== 4 || indexedStringReads !== 15 || boundedPackLoops !== 1 || boundedNumberPushes !== 1 || packBudgets !== 1 || integerDivisions !== 1 || boundedChunkPushes !== 2 || compiled.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error))
    throw new Error('Buffer helper transpilation or indexed-read boundaries changed');
const hash = text => createHash('sha256').update(text).digest('hex');
const content = `// Generated from PXT Arcade ${bundle.versions.target} base/buffer.ts, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Original source: https://github.com/microsoft/pxt-common-packages/blob/master/libs/base/buffer.ts
// Complete bundled buffer.ts SHA256: ${hash(source)}
// Selected unadapted source SHA256: ${hash(input)}
// Regenerate: node scripts/generate-arcade-buffer-helpers.mjs
// Nine indexed Buffer reads and four writes use original getByte/setByte shims.
// Fifteen string-index reads use the original PXT String_.charAt boundary.
// One Math.idiv uses original signed division; two chunk pushes check collection bounds before allocation.
// One pack loop has repeat/work bounds and one unpack push checks result allocation.
module.exports = function initializePxtBufferHelpers(Buffer, NumberFormat, idiv, pushChunk, control, guardPackRepeat, guardPackStep, pushNumber) {
const create = Buffer.create;
const fromUTF8 = Buffer.fromUTF8;
${compiled.outputText}
return {...helpers, sizeOfNumberFormat: Buffer.sizeOfNumberFormat, fromArray: Buffer.fromArray, concatArrays: Buffer.concat, fromBase64: Buffer.fromBase64, chunkedFromUTF8: Buffer.chunkedFromUTF8, packedSize: Buffer.packedSize, pack: Buffer.pack};
};
`;
const target = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer-helpers-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('buffer-helpers-pxt.js differs from pinned source/adaptation');
    console.log('Verified original Buffer scalar and array helpers');
} else writeFileSync(target, content);
