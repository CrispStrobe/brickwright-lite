import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
test('independent SPIKE gate names the actual eight-group guest bridge suite',()=>{
 const source=readFileSync(new URL('../scripts/verify-independent-spike.mjs',import.meta.url),'utf8');
 const list=/const tests=\[([\s\S]*?)\];/.exec(source);assert.ok(list);
 const names=[...list[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 assert.equal(new Set(names).size,names.length);
 for(const name of names)assert.ok(existsSync(new URL(`${name}.test.mjs`,import.meta.url)),name);
 assert.ok(names.includes('spike-renode-arena'));
 const bridge=readFileSync(new URL('./spike-renode-arena.test.mjs',import.meta.url),'utf8');
 assert.equal((bridge.match(/\btest\(/g)||[]).length,8);
});
