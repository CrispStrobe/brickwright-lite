import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeAfter} from './helpers/js-scope.mjs';
import {registerEditorMenuActions, getEditorMenuItems, runEditorMenuAction} from '../overlay/scratch-gui/src/lib/editor-menu-actions.js';
const source=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx',import.meta.url),'utf8');
const makeProvider=surface=>new Function('getUndoState',`return function() ${scopeAfter(source,'    editorMenuActions ()')}`)(()=>({surface}));
const host=()=>({_menuMounted:true,props:{isVisible:true,locale:'en'},state:{panel:'designer'},_designerMenuActions:[],setState(next){Object.assign(this.state,next);}});

test('old qualified Circuit suppliers retain four real host panels and their original File bridge',()=>{
    const owner=host(),get=makeProvider('circuit');
    const unregister=registerEditorMenuActions('test-circuit',()=>get.call(owner));
    try{
        assert.deepEqual(getEditorMenuItems('test-circuit','file'),[],'no fabricated supplier editing commands');
        const panels=getEditorMenuItems('test-circuit','edit');assert.equal(panels.length,4);
        assert.equal(panels[0].checked,true);assert.equal(panels[0].radio,true);
        assert.equal(runEditorMenuAction('test-circuit','host-panel-warnings'),true);assert.equal(owner.state.panel,'warnings');
        owner.props.locale='de';assert.equal(getEditorMenuItems('test-circuit','edit')[2].label,'Stückliste');
    }finally{unregister();}
});

test('supplier commands preserve actual availability, live refusals and checked view state',()=>{
    const owner=host(),get=makeProvider('circuit');let current=true,calls=0;
    owner._designerMenuActions=[
        {name:'copy',label:'Copy',location:'edit',enabled:true,run:()=>{if(!current)return false;calls++;}},
        {name:'voltage-view',label:'Voltages',location:'edit',submenu:'View',enabled:true,checked:true,run:()=>{}},
        {name:'undo',label:'Undo',location:'edit',enabled:true,run:()=>assert.fail('duplicate history')},
        {name:'invalid',label:'Invalid',location:'edit',enabled:true,run:null}
    ];
    const unregister=registerEditorMenuActions('test-circuit-new',()=>get.call(owner));
    try{
        assert.equal(runEditorMenuAction('test-circuit-new','copy'),true);assert.equal(calls,1);
        current=false;assert.equal(runEditorMenuAction('test-circuit-new','copy'),false);assert.equal(calls,1);
        assert.equal(runEditorMenuAction('test-circuit-new','undo'),false);
        assert.equal(runEditorMenuAction('test-circuit-new','invalid'),false);
        assert.equal(getEditorMenuItems('test-circuit-new','edit').find(x=>x.name==='voltage-view').checked,true);
        owner.props.isVisible=false;assert.equal(runEditorMenuAction('test-circuit-new','copy'),false);
        owner.props.isVisible=true;owner._menuMounted=false;assert.equal(get.call(owner),null);
        owner._menuMounted=true;assert.equal(makeProvider('robots').call(owner),null);
    }finally{unregister();}
});

test('supplier clear notifications drop stale commands and do nothing after unmount',()=>{
    const owner=host();let notified=0;
    const receive=new Function('notifyEditorMenuActions',`return function(actions) ${scopeAfter(source,'    handleDesignerMenuActions (actions)')}`)(()=>notified++);
    receive.call(owner,[{name:'copy'}]);assert.equal(owner._designerMenuActions.length,1);
    receive.call(owner,[]);assert.deepEqual(owner._designerMenuActions,[]);
    owner._menuMounted=false;receive.call(owner,[{name:'stale'}]);assert.deepEqual(owner._designerMenuActions,[]);assert.equal(notified,2);
});

test('designer file commands sit flat in File under the host circuit names',()=>{
    const owner=host(),get=makeProvider('circuit');
    owner._designerMenuActions=['open','save','import','export','clear'].map(name=>
        ({name,label:name,location:'file',submenu:'file',enabled:name!=='clear',run:()=>{}}));
    const unregister=registerEditorMenuActions('test-circuit-file',()=>get.call(owner));
    try{
        const file=getEditorMenuItems('test-circuit-file','file');
        assert.deepEqual(file.map(item=>item.label),['Open circuit…','Save circuit','Import circuit…','Export circuit…','clear']);
        assert.ok(file.every(item=>item.submenu===''),'the supplier group key is not a visible submenu');
        assert.equal(file[4].enabled,false);
        owner.props.locale='de';
        assert.equal(getEditorMenuItems('test-circuit-file','file')[0].label,'Schaltung öffnen…');
    }finally{unregister();}
});
