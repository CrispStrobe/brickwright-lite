import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';

test('instanceof parses at relational precedence without splitting its operands',()=>{
 const ast=parseMakeCodeTs('let matched = item instanceof api.Holder && enabled;let nested = item instanceof api.Holder === false');
 const first=ast.body[0].decls[0].init;assert.equal(first.op,'&&');assert.equal(first.left.op,'instanceof');assert.equal(first.left.left.name,'item');assert.equal(first.left.right.name,'Holder');assert.equal(first.right.name,'enabled');
 const second=ast.body[1].decls[0].init;assert.equal(second.op,'===');assert.equal(second.left.op,'instanceof');assert.equal(second.right.value,false);
});

test('instanceof preserves call operands and reports unimplemented class identity',()=>{
 const ast=parseMakeCodeTs('if (getObject() instanceof getConstructor()) { game.splash("match") }');
 assert.equal(ast.body[0].test.op,'instanceof');assert.equal(ast.body[0].test.left.type,'Call');assert.equal(ast.body[0].test.right.type,'Call');
 const imported=arcadeToPseudocode('let matched=object instanceof Holder');
 assert.ok(imported.unsupported.some(x=>x.includes('instanceof requires runtime class identity')));
 assert.match(imported.code,/# unsupported: instanceof requires runtime class identity/);
});
