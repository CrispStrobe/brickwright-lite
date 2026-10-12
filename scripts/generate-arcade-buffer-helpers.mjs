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
const names = new Set(['bufferConcat', 'bufferEquals', 'bufferIndexOf', 'bufferToArray']);
const selected = namespace.body.statements.filter(node => ts.isFunctionDeclaration(node) && names.delete(node.name.text));
if (names.size) throw new Error('Missing pinned Buffer helper: ' + [...names].join(', '));
const bufferNamespace = parsed.statements.find(node => ts.isModuleDeclaration(node) && node.name.text === 'Buffer');
const bufferFunctions = new Set(['sizeOfNumberFormat', 'fromArray', 'concat']);
const staticFunctions = bufferNamespace?.body?.statements?.filter(node => ts.isFunctionDeclaration(node) && bufferFunctions.delete(node.name.text));
if (bufferFunctions.size) throw new Error('Missing pinned Buffer static functions: ' + [...bufferFunctions].join(', '));
const input = 'namespace helpers {\n' + selected.map(node => node.getFullText(parsed)).join('\n') + '\n}' +
    '\nnamespace Buffer {\n' + staticFunctions.map(node => node.getFullText(parsed)).join('\n') + '\n}';
const bufferNames = new Set(['a', 'b', 'l', 'r']);
let indexedReads = 0, indexedWrites = 0;
const indexedReadTransformer = context => {
    const visit = node => {
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isElementAccessExpression(node.left) && ts.isIdentifier(node.left.expression) && node.left.expression.text === 'buf') {
            indexedWrites++;
            return context.factory.createCallExpression(
                context.factory.createPropertyAccessExpression(node.left.expression, 'setByte'), undefined,
                [ts.visitNode(node.left.argumentExpression, visit), ts.visitNode(node.right, visit)]);
        }
        const visited = ts.visitEachChild(node, visit, context);
        if (ts.isElementAccessExpression(node)) {
            // bytes is the ordinary number[] parameter, not a PXT Buffer.
            if (ts.isIdentifier(node.expression) && node.expression.text === 'bytes') return visited;
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
if (indexedReads !== 6 || indexedWrites !== 1 || compiled.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error))
    throw new Error('Buffer helper transpilation or indexed-read boundaries changed');
const hash = text => createHash('sha256').update(text).digest('hex');
const content = `// Generated from PXT Arcade ${bundle.versions.target} base/buffer.ts, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Original source: https://github.com/microsoft/pxt-common-packages/blob/master/libs/base/buffer.ts
// Complete bundled buffer.ts SHA256: ${hash(source)}
// Selected unadapted source SHA256: ${hash(input)}
// Regenerate: node scripts/generate-arcade-buffer-helpers.mjs
// Six indexed Buffer reads and one write use original getByte/setByte shims.
module.exports = function initializePxtBufferHelpers(Buffer, NumberFormat) {
${compiled.outputText}
return {...helpers, sizeOfNumberFormat: Buffer.sizeOfNumberFormat, fromArray: Buffer.fromArray, concatArrays: Buffer.concat};
};
`;
const target = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer-helpers-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('buffer-helpers-pxt.js differs from pinned source/adaptation');
    console.log('Verified original Buffer scalar and array helpers');
} else writeFileSync(target, content);
