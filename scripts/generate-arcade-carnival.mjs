#!/usr/bin/env node
// Pinned carnival scoring/dialog code. Source expressions and control flow are
// retained; blocking PXT fiber calls become awaited host operations.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const folder = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade');
const source = readFileSync(resolve(folder, 'carnival-source/carnival.ts'), 'utf8');
const sha = createHash('sha256').update(source).digest('hex');
if (sha !== '6530f15cbddbc41419a59a41e8c13276eb6ac65645c04d02e899826c08e3f765') {
    throw new Error('carnival source differs from reviewed v0.0.7 commit 915caca4');
}
const parsed = ts.createSourceFile('carnival.ts', source, ts.ScriptTarget.Latest, true);
const namespace = parsed.statements.find(node => ts.isModuleDeclaration(node) && node.name.text === 'carnival');
const names = new Set(['WinTypes', 'ScoreTypes', 'countdownInitialized', 'startCountdownGame',
    'saveLowScore', 'newGameOver', 'init', 'GameOverDialog', 'onGameOverExpanded', 'customGameOverExpanded']);
const selected = namespace.body.statements.filter(node => {
    const name = node.name?.text || (ts.isVariableStatement(node) ? node.declarationList.declarations[0].name.text : null);
    return names.delete(name);
});
if (names.size) throw new Error('missing selected declarations: ' + [...names].join(', '));
const input = 'namespace carnival {\n' + selected.map(node => node.getFullText(parsed)).join('\n') + '\n}';
const blocking = new Set(['newGameOver', 'pause', 'game.popScene', 'game.pushScene', 'game.waitAnyButton', 'game.over', 'winSound.play']);
const transformer = context => {
    const f = context.factory;
    const ownAwait = node => {
        if (ts.isAwaitExpression(node)) return true;
        if (ts.isFunctionLike(node)) return false;
        let found = false;
        ts.forEachChild(node, child => { if (ownAwait(child)) found = true; });
        return found;
    };
    const visit = node => {
        const visited = ts.visitEachChild(node, visit, context);
        if (ts.isCallExpression(node) && blocking.has(node.expression.getText())) return f.createAwaitExpression(visited);
        if ((ts.isFunctionDeclaration(visited) || ts.isFunctionExpression(visited)) && ownAwait(visited.body)) {
            const modifiers = [...(visited.modifiers || []), f.createModifier(ts.SyntaxKind.AsyncKeyword)];
            if (ts.isFunctionDeclaration(visited)) return f.updateFunctionDeclaration(visited, modifiers,
                visited.asteriskToken, visited.name, visited.typeParameters, visited.parameters, visited.type, visited.body);
            return f.updateFunctionExpression(visited, modifiers, visited.asteriskToken,
                visited.name, visited.typeParameters, visited.parameters, visited.type, visited.body);
        }
        return visited;
    };
    return node => ts.visitNode(node, visit);
};
const compiled = ts.transpileModule(input, {compilerOptions: {target: ts.ScriptTarget.ES2018},
    transformers: {before: [transformer]}, reportDiagnostics: true});
if (compiled.diagnostics?.some(d => d.category === ts.DiagnosticCategory.Error)) throw new Error('carnival transpilation failed');
const content = `// Generated from microsoft/arcade-carnival v0.0.7, commit 915caca4a2d83a7071df59407a9987992c083750.
// MIT, Copyright (c) Microsoft Corporation. Exact source and notice: carnival-source/.
// Source sha256 ${sha}. Regenerate: node scripts/generate-arcade-carnival.mjs
// Host blocking operations return Promises; one factory instance owns one program's initialization.
module.exports = function initializePxtCarnival(host) {
const {game, info, effects, settings, control, scene, music, screen, image, img, pause} = host;
${compiled.outputText}
return {carnival};
};
`;
const target = resolve(folder, 'carnival-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('carnival-pxt.js differs from pinned source and adaptation');
    console.log('Verified pinned carnival scoring/dialog module');
} else {
    writeFileSync(target, content);
    console.log('Generated pinned carnival scoring/dialog module');
}
