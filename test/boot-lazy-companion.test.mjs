import test from 'node:test';
import assert from 'node:assert/strict';
import {proveMenuLazyCompanion} from '../scripts/lib/boot-lazy-companion.mjs';

// Public manufactured emitted bytes: no runtime, DOM, webpack or imports execute.
const chunk = (ids, modules, ns = 'webpackChunkApp') =>
    `"use strict";(self.${ns}=self.${ns}||[]).push([[${ids}],{${modules}}]);`;
const normalizer = `20:(e,t,r)=>{r.d(t,{normalizeProjectMenuArgs:()=>normalize});
    var table=r(30);function normalize(project){return table.table;}}`;
const table = `30:(e,t)=>{t.table={PORT:"+MULTIPLE_PORT"};}`;
const group = `Promise.all([r.e(7),r.e(9)]).then(r.bind(r,20))
    .then(m=>m.normalizeProjectMenuArgs(project),()=>{})`;
const boot = expression => `(()=>{var modules={100:(e,t,r)=>{
    function migrate(project){return ${expression};}e.exports=migrate;}};
    function req(id){var m={exports:{}};modules[id].call(m.exports,m,m.exports,req);return m.exports;}
    req.m=modules;var queue=self.webpackChunkApp=self.webpackChunkApp||[];})();`;
function fixture() {
    return {entryName:'chunks/bw-extension-menus.hash.js',html:'<script src="gui.js"></script>',
        eagerSources:[{name:'gui.js',source:boot(group)}],
        lazySources:[{name:'chunks/bw-extension-menus.hash.js',source:chunk('7',normalizer)},
            {name:'chunks/shared.hash.js',source:chunk('9',table)}]};
}
const resolverExpression = `id===9?"chunks/shared.hash.js":"chunks/"+({7:"bw-extension-menus.hash",17:"sb3-creator"}[id]||id)+".js"`;
function resolvedFixture(expression = resolverExpression) {
    const f=fixture();f.eagerSources[0].source=f.eagerSources[0].source.replace('req.m=modules;',`req.m=modules;req.u=id=>${expression};`);
    f.lazySources.push({name:'chunks/sb3-creator.js',source:chunk('17,7',normalizer)});
    return f;
}
const run = input => proveMenuLazyCompanion(input);
const bad = (input, reason) => {const p=run(input);assert.equal(p.ok,false,JSON.stringify(p));if(reason)assert.equal(p.reason,reason);};

test('menu companion joins actual runtime, request group, normalizer and table module',()=>{
    const p=run(fixture());assert.equal(p.ok,true,JSON.stringify(p));
    assert.deepEqual(p.requestedChunkIDs,[7,9]);assert.equal(p.entryModule,20);
    assert.deepEqual(p.markerFiles,['chunks/shared.hash.js']);assert.equal(p.namespace,'webpackChunkApp');
    assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.files)&&Object.isFrozen(p.markerFiles));
    const changed=fixture();changed.eagerSources[0].source=boot(group.replaceAll('7','17').replaceAll('9','19').replaceAll('20','120'));
    changed.lazySources[0].source=chunk('17',normalizer.replace('20:','120:'));
    changed.lazySources[1].source=chunk('19',table);
    assert.equal(run(changed).ok,true,'IDs derive from emitted bindings, never observed build numbers');
    // Real minified menu shape: mutable fresh-ID state, parameter reassignment,
    // var/parameter reuse and a loop binding shadowing an earlier parameter.
    const real=fixture();real.lazySources[0].source=chunk('7',`20:(e,t,r)=>{
        r.d(t,{normalizeProjectMenuArgs:()=>normalize});var table=r(30);let serial=0;
        function copy(e,key){var e;key=String(key);return e[key];}
        const next=used=>{let id;do{id="menu-"+serial++;}while(used[id]);return id;};
        const repair=(blocks,id)=>[{value:copy(table,"table"),name:id(blocks)}];
        const normalize=project=>{const out=[];
            for(const target of project.targets)for(const project of repair(target.blocks,next))out.push(project);
            return out;};}`);
    assert.equal(run(real).ok,true,'actual module imports remain immutable while unrelated state and locals execute');
    const aliased=run(resolvedFixture());assert.equal(aliased.ok,true,JSON.stringify(aliased));
    assert.equal(aliased.filenameAuthority,'same-bootstrap-static-resolver');
    assert.deepEqual(aliased.files,['chunks/bw-extension-menus.hash.js','chunks/shared.hash.js'],
        'unrequested overlapping registration cannot supply the selected entry or table');

});

test('menu companion refuses missing, duplicate and unrelated chunk ownership',()=>{
    let f=fixture();f.lazySources.pop();bad(f,'UNIQUE_COMPANION_FILE');
    f=fixture();f.lazySources.push({name:'chunks/duplicate.js',source:chunk('9',table)});bad(f,'UNIQUE_COMPANION_FILE');
    f=fixture();f.lazySources[1].source=chunk('10',table);bad(f,'UNIQUE_COMPANION_FILE');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('r(30)','r(31)'));bad(f,'UNREACHED_MARKER_MODULE');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('r(30)','r(31)'));
    f.lazySources[1].source=chunk('9',`31:(e,t)=>{t.table={};},${table}`);bad(f,'UNREACHED_MARKER_MODULE');
    f=fixture();f.lazySources=f.lazySources.slice(1);bad(f,'NAMED_ENTRY');
});

test('menu companion refuses wrong bound module and a module which is never normalized',()=>{
    let f=fixture();f.eagerSources[0].source=boot(group.replace('bind(r,20)','bind(r,21)'));bad(f,'NO_OWNED_REQUEST_GROUP');
    f=fixture();f.eagerSources[0].source=boot(group.replace('.then(m=>m.normalizeProjectMenuArgs(project),()=>{})',''));bad(f,'NO_OWNED_REQUEST_GROUP');
    f=fixture();f.eagerSources[0].source=boot(group.replace('m.normalizeProjectMenuArgs(project)','other.normalizeProjectMenuArgs(project)'));bad(f,'NO_OWNED_REQUEST_GROUP');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('normalizeProjectMenuArgs','other'));bad(f,'UNIQUE_NORMALIZER');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('r.d(t,','r.d(other,'));bad(f,'UNIQUE_NORMALIZER');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('r.d(t,','t=other;r.d(t,'));bad(f,'UNIQUE_NORMALIZER');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('normalizeProjectMenuArgs:()=>','normalizeProjectMenuArgs:async()=>'));bad(f,'NORMALIZER_EXPORT');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('function normalize','function* normalize'));bad(f,'NORMALIZER_BINDING');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('function normalize','async function normalize'));bad(f,'NORMALIZER_BINDING');
});

test('menu companion rejects comments, strings, regexp and unrelated numeric objects as loader evidence',()=>{
    for(const fake of [`(${JSON.stringify(group)})`,`(/Promise.all\\(\\[r.e\\(7\\)/)`,`(0 /* ${group} */)`]){
        const f=fixture();f.eagerSources[0].source=boot(fake);bad(f,'NO_OWNED_REQUEST_GROUP');
    }
    const f=fixture();f.eagerSources[0].source=`var modules={100:(e,t,r)=>{return ${group}}};
        self.webpackChunkApp=self.webpackChunkApp||[];`;
    bad(f,'RUNTIME_MODULE_DICTIONARY');
});

test('menu companion tracks lexical loader, Promise and normalizer namespace identities',()=>{
    let f=fixture();f.eagerSources[0].source=boot(group.replace('r.e(9)','other.e(9)'));bad(f,'NO_OWNED_REQUEST_GROUP');
    f=fixture();f.eagerSources[0].source=boot(`(()=>{const Promise=foreign;return ${group};})()`);bad(f,'NO_OWNED_REQUEST_GROUP');
    f=fixture();f.eagerSources[0].source=boot(`(()=>{r=foreign;return ${group};})()`);bad(f,'NO_OWNED_REQUEST_GROUP');
    f=fixture();f.eagerSources[0].source=boot(group.replace('bind(r,20)','bind(other,20)'));bad(f,'NO_OWNED_REQUEST_GROUP');
    f=fixture();f.lazySources[1].source=chunk('9',table,'webpackChunkOther');bad(f,'COMPANION_NAMESPACE_OR_IDS');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer);
    f.lazySources[0].source=f.lazySources[0].source.replace('var table=r(30);','r=foreign;var table=r(30);');bad(f,'UNIQUE_NORMALIZER');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('var table=r(30);','var table=r(30);table=foreign;'));bad(f,'AMBIGUOUS_NORMALIZER_DEPENDENCY');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('return table.table;','let alias=table;alias=foreign;return alias.table;'));bad(f,'AMBIGUOUS_NORMALIZER_DEPENDENCY');
    f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('r(30)','r(31)'));
    f.lazySources[1].source=chunk('9',`31:(e,t,r)=>{r=foreign;t.value=r(30);},${table}`);bad(f,'DEPENDENCY_LOADER_MUTATED');
});

test('menu companion rejects ambiguous groups and duplicate module definitions',()=>{
    let f=fixture();f.eagerSources[0].source=boot(`(${group},${group.replace('r.e(9)','r.e(10)')})`);bad(f,'AMBIGUOUS_REQUEST_GROUP');
    f=fixture();f.lazySources[1].source=chunk('9',`${table},${normalizer}`);bad(f,'DUPLICATE_MODULE');
    f=fixture();f.lazySources[1].source=chunk('9',`${table},${table}`);bad(f,'MODULE_DICTIONARY_SHAPE');
    f=fixture();f.lazySources[1].source=chunk('7,9',table);bad(f,'UNIQUE_NAMED_CHUNK_ID');
    f=fixture();f.lazySources.push({name:'chunks/duplicate-entry-id.js',source:chunk('7',`40:(e,t)=>{t.other=true;}`)});bad(f,'UNIQUE_NAMED_CHUNK_ID');
    f=resolvedFixture();f.lazySources[1].source=chunk('7,9',table);bad(f,'DUPLICATE_CHUNK_ID');
    f=resolvedFixture();f.eagerSources[0].source=f.eagerSources[0].source.replace('req.u=id=>',`req.u=id=>"chunks/no.js";req.u=id=>`);bad(f,'MUTATED_RUNTIME_RESOLVER');
    f=resolvedFixture('id===7?"chunks/wrong.js":"chunks/shared.hash.js"');bad(f,'RUNTIME_ENTRY_FILENAME');
    f=resolvedFixture('foreign(id)');bad(f,'RUNTIME_RESOLVER_EXPRESSION');
    f=resolvedFixture('"chunks/"+({"07":"bw-extension-menus.hash"}[id]||id)+".js"');bad(f,'RUNTIME_RESOLVER_OWN_MAP');
    f=resolvedFixture();f.eagerSources[0].source=f.eagerSources[0].source.replace('req.u=id=>','req.u=async id=>');bad(f,'RUNTIME_RESOLVER_FUNCTION');
    f=resolvedFixture('outerID===7?"chunks/bw-extension-menus.hash.js":"chunks/shared.hash.js"');bad(f,'RUNTIME_RESOLVER_FREE_BINDING');
    f=resolvedFixture('"chunks/"+({get 7(){return "bw-extension-menus.hash"}}[id]||id)+".js"');bad(f,'RUNTIME_RESOLVER_OWN_MAP');
    f=resolvedFixture();f.eagerSources[0].source=f.eagerSources[0].source.replace('req.u=id=>','unrelated.u=id=>');bad(f,'UNIQUE_NAMED_CHUNK_ID');
    f=resolvedFixture();f.eagerSources.push({name:'second-runtime.js',source:f.eagerSources[0].source});bad(f,'AMBIGUOUS_RUNTIME_RESOLVER');
    f=resolvedFixture('id===7?"chunks/bw-extension-menus.hash.js":"chunks/missing.js"');bad(f,'UNIQUE_COMPANION_FILE');

    f=fixture();f.lazySources[0].source+=chunk('8',normalizer);bad(f,'UNIQUE_CHUNK_REGISTRATION');
    for(const factory of ['20:async(e,t,r)=>{','20:function*(e,t,r){']){f=fixture();f.lazySources[0].source=chunk('7',normalizer.replace('20:(e,t,r)=>{',factory));bad(f,'MODULE_DICTIONARY_SHAPE');}
    for(const index of [0,1]){f=fixture();f.lazySources[index].source=f.lazySources[index].source.replace('}]);','},r=>{r.m[20]=foreign;}]);');bad(f,'UNIQUE_CHUNK_REGISTRATION');}
});

test('menu companion requires actual reached string literal marker, never a comment or detached lazy marker',()=>{
    let f=fixture();f.lazySources[1].source=chunk('9',`30:(e,t)=>{t.table={};/* +MULTIPLE_PORT */}`);bad(f,'NO_REACHED_TABLE_MARKER');
    f=fixture();f.lazySources[1].source=chunk('9',`30:(e,t)=>{t.table={};}`);
    f.lazySources.push({name:'chunks/unrelated.js',source:chunk('99',table)});bad(f,'NO_REACHED_TABLE_MARKER');
    f=fixture();f.lazySources.push({name:'chunks/table.js.map',source:'+MULTIPLE_PORT'});
    f.lazySources[1].source=chunk('9',`30:(e,t)=>{t.table={};}`);bad(f,'NO_REACHED_TABLE_MARKER');
});

test('menu companion retains eager and every requested-file HTML exclusion',()=>{
    let f=fixture();f.eagerSources.push({name:'copy.js',source:'"+MULTIPLE_PORT";'});bad(f,'EAGER_TABLE_MARKER');
    for(const rel of ['script','preload','prefetch']){
        f=fixture();f.html+=rel==='script'?'<script src="chunks/shared.hash.js"></script>':
            `<link rel="${rel}" href="chunks/shared.hash.js">`;
        bad(f,'HTML_REQUEST_GROUP_REFERENCE');
    }
    f=fixture();f.html+='<link rel="prefetch" href="chunks/bw-extension-menus.hash.js">';bad(f,'HTML_REQUEST_GROUP_REFERENCE');
});
