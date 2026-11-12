// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const babelRequire = createRequire(require.resolve('@babel/core'));
const parser = babelRequire('@babel/parser');
const generate = babelRequire('@babel/generator').default;
const panel = await readFile(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
const ast = parser.parse(panel, {sourceType: 'module', plugins: ['jsx']});
const cls = ast.program.body.find(n => n.type === 'ClassDeclaration' && n.id?.name === 'DebugPanel');
const methods = ['setSamdButton', 'releaseSamdButtons'].map(name => {
    const method = cls.body.body.find(n => n.key?.name === name);
    assert.ok(method, `missing ${name}`);
    return generate(method).code;
}).join('\n');
const Host = new Function(`return class { ${methods} }`)();

test('button actions emit recorded transactions once and release all held channels', () => {
    const calls=[];
    const host=new Host();
    host._samdPressed=new Set();
    host.state={runner:{setInputs: rows=>{calls.push(rows);return {accepted:true};}}};
    host.setState=update=>Object.assign(host.state,update);
    host.setSamdButton('right',true);
    host.setSamdButton('right',true);
    host.setSamdButton('a',true);
    host.releaseSamdButtons();
    assert.deepEqual(calls, [[{component:'buttons',channel:'right',value:1}],
        [{component:'buttons',channel:'a',value:1}],
        [{component:'buttons',channel:'right',value:0},{component:'buttons',channel:'a',value:0}]]);
    assert.equal(host._samdPressed.size,0);
});

test('a refused button write is visible and does not become a held input', () => {
    const host=new Host();
    host._samdPressed=new Set();
    host.state={runner:{setInputs:()=>({accepted:false,reason:'input refused'})}};
    host.setState=update=>Object.assign(host.state,update);
    host.setSamdButton('right',true);
    assert.equal(host.state.samdInputError,'input refused');
    assert.equal(host._samdPressed.size,0);
});
