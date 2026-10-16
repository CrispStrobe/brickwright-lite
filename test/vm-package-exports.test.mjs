import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {withVmPackageExports} from '../scripts/lib/vm-package-exports.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const stock=()=>JSON.parse(readFileSync(path.join(ROOT,'packages/scratch-vm/package.json'),'utf8'));
const MODEL='./src/util/bw-procedure-constraint-model.js';
const guiSource=readFileSync(path.join(ROOT,'overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-export.js'),'utf8');
const request=guiSource.match(/^import model from '([^']+)';/)[1];
const nativeSource=readFileSync(path.join(ROOT,'overlay/scratch-vm/src/extensions/crispstrobe/arcade/procedure-parameter-constraints.js'),'utf8');
const nativeRequest=nativeSource.match(/^const model=require\('([^']+)'\);/)[1];
function fixture(integrated=false) {
    const parent=path.join(ROOT,'test-results');mkdirSync(parent,{recursive:true});
    const root=mkdtempSync(path.join(parent,'vm-package-exports-'));
    const consumer=path.join(root,'gui'),vm=path.join(consumer,'node_modules/scratch-vm');
    mkdirSync(vm,{recursive:true});
    const put=(name,bytes)=>{const p=path.join(vm,name);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,bytes);};
    const pkg=stock();put('package.json',JSON.stringify(integrated?withVmPackageExports(pkg):pkg));
    for(const name of ['src/index.js','dist/node/scratch-vm.js','dist/web/scratch-vm.js'])put(name,'throw Error("root entry must only be resolved, never executed");\n');
    put(MODEL,readFileSync(path.join(ROOT,'overlay/scratch-vm',MODEL)));
    const nativeFile=path.join(vm,'src/extensions/crispstrobe/arcade/procedure-parameter-constraints.js');
    put('src/extensions/crispstrobe/arcade/procedure-parameter-constraints.js',nativeSource);
    return {root,vm,consumer,pkg,put,require:createRequire(path.join(consumer,'consumer.cjs')),nativeRequire:createRequire(nativeFile),close:()=>rmSync(root,{recursive:true,force:true})};
}
test('installed VM exports preserve all root conditions and one canonical model path',()=>{
    const pkg=stock(),before=JSON.stringify(pkg),updated=withVmPackageExports(pkg);
    assert.equal(JSON.stringify(pkg),before);assert.deepEqual(updated.exports['.'],pkg.exports);
    assert.equal(updated.exports[MODEL],MODEL);assert.deepEqual(Object.keys(updated.exports),['.',MODEL]);
    const {exports:ignored,...rest}=updated;const {exports:original,...oldRest}=pkg;assert.deepEqual(rest,oldRest);
    assert.deepEqual(withVmPackageExports(updated),updated);
});
test('existing subpaths and root fallback arrays remain intact',()=>{
    const pkg=stock(),root=[{node:'./dist/node/scratch-vm.js'},'./src/index.js'];
    const updated=withVmPackageExports({...pkg,exports:{'.':root,'./existing':'./src/existing.js','./blocked':null}});
    assert.deepEqual(updated.exports['.'],root);assert.equal(updated.exports['./existing'],'./src/existing.js');assert.equal(updated.exports['./blocked'],null);
    assert.deepEqual(withVmPackageExports({...pkg,exports:root}).exports['.'],root);
});
test('conflicting model exports, malformed maps and a different package refuse',()=>{
    const pkg=stock();for(const exports of [null,7,{'.':pkg.exports,node:'./dist/node/scratch-vm.js'},{'.':pkg.exports,[MODEL]:'./src/other.js'},{'.':17},{node:17}]){
        const input={...pkg,exports},before=JSON.stringify(input);assert.throws(()=>withVmPackageExports(input));assert.equal(JSON.stringify(input),before);
    }
    assert.throws(()=>withVmPackageExports({...pkg,name:'other'}));assert.throws(()=>withVmPackageExports({...pkg,version:'4.8.116'}));
});
test('normal Node package resolution rejects before integration and shares the installed native model after it',()=>{
    // Fresh package roots avoid Node's legitimate package.json resolution cache;
    // this is installation-time integration, not a runtime package hot reload.
    const before=fixture(),after=fixture(true);try{
        assert.throws(()=>before.require.resolve(request),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
        assert.equal(before.require.resolve('scratch-vm'),path.join(before.vm,'dist/node/scratch-vm.js'));
        assert.equal(after.require.resolve(request),path.join(after.vm,MODEL));
        assert.equal(after.require.resolve('scratch-vm'),path.join(after.vm,'dist/node/scratch-vm.js'));
        const fromGui=after.require(request),fromNative=after.nativeRequire(nativeRequest);
        assert.equal(fromGui,fromNative);assert.equal(typeof fromGui.prepare,'function');assert.equal(fromGui.OPCODE,'arcade_declareParameterConstraint');
    }finally{before.close();after.close();}
});
test('production webpack resolver reaches the same installed model without aliases',()=>{
    const guiRequire=createRequire(new URL('../packages/scratch-gui/package.json',import.meta.url));
    const {create}=guiRequire('enhanced-resolve');
    const resolve=create.sync({conditionNames:['webpack','browser','import','default'],extensions:['.js']});
    const before=fixture(),after=fixture(true);try{
        assert.throws(()=>resolve(before.consumer,request),/not exported|not exported from/i);
        assert.equal(resolve(before.consumer,'scratch-vm'),path.join(before.vm,'src/index.js'));
        assert.equal(resolve(after.consumer,request),path.join(after.vm,MODEL));
        assert.equal(resolve(after.consumer,'scratch-vm'),path.join(after.vm,'src/index.js'));
        assert.equal(after.require(resolve(after.consumer,request)),after.nativeRequire(nativeRequest));
    }finally{before.close();after.close();}
});
