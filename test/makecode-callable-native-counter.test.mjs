import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
test('actual native callable words produce escaping counters, share alias cells and keep separate factory calls independent',async()=>{
    const signature=JSON.stringify(JSON.stringify({kind:'callable',parameters:[],result:{kind:'named',name:'number'}}));
    const metadata=JSON.stringify(JSON.stringify({site:'counter_site',parameters:[],captures:[{name:'n',mode:'cell'}]}));
    const run=await runProgram(`DEVICE ARCADE
GLOBAL first, alias, second, result1, result2, result3
SPRITE Game:
WHEN arcade source starts:
  declare arcade source callable first signature ${signature}
  declare arcade source callable alias signature ${signature}
  declare arcade source callable second signature ${signature}
  arcade declare callable "counter" metadata ${metadata}
  set first to (arcade call function "factory %s" arguments (arcade function argument 2 rest "[]"))
  set alias to first
  set second to (arcade call function "factory %s" arguments (arcade function argument 2 rest "[]"))
  set result1 to (arcade invoke callable first arguments "[]")
  set result2 to (arcade invoke callable alias arguments "[]")
  set result3 to (arcade invoke callable second arguments "[]")
WHEN arcade callable "counter" dispatched:
  arcade run dispatched callable
DEFINE factory (start):
  arcade set local n to start
  arcade return value (arcade callable "counter")
DEFINE counter:
  arcade set captured n to ((arcade captured n) + 1)
  arcade return value (arcade captured n)
`,{frames:40});
    try {
        assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);
        const vars=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
        const read=name=>vars.find(variable=>variable.name===name)?.value;
        assert.deepEqual(['result1','result2','result3'].map(name=>BW.decode(read(name))),[3,4,3]);
        assert.equal(read('first'),read('alias'));
        assert.notEqual(read('first'),read('second'));
        const ext=run.vm.runtime._arcadeFramePhase.ext;
        assert.equal(ext._callableValues.typeOf(read('first')),'object');
        assert.equal(ext._functionCalls.size,0);
        const first=read('first');run.vm.stopAll();assert.throws(()=>ext.holdCallable(first),/Stale or foreign callable/);
    } finally {run.vm.quit();clearStrayTimers();}
});
