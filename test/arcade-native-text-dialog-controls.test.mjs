import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const req=createRequire(path.join(process.env.BW_INTEGRATED_ROOT || path.resolve(import.meta.dirname,'..'),'packages/scratch-gui/package.json'));
const React=req('react'),{create,act}=req('react-test-renderer'),babel=req('@babel/core');
const source=fs.readFileSync(new URL('../overlay/scratch-gui/src/components/stage/arcade-dialog.jsx',import.meta.url),'utf8');
const transformed=babel.transformSync(source,{babelrc:false,configFile:false,presets:[req.resolve('@babel/preset-react')],plugins:[req.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const mod={exports:{}};
new Function('require','module','exports',transformed)(name=>name==='react'?React:name==='react-dom'?{createPortal:element=>element}:name.endsWith('.css')?new Proxy({},{get:(_,key)=>key}):name.endsWith('bw-i18n.js')?{makeT:()=>((_,key)=>key),browserLocale:()=> 'en'}:req(name),mod,mod.exports);
const Dialog=mod.exports.default;
const event=key=>({key,repeat:false,preventDefault(){},stopPropagation(){}});

test('native accessible dialog sends held/released edges and never direct dismissal',async()=>{
 const edges=[];let dismissed=0,view;
 const documentBefore=globalThis.document;globalThis.document={body:{}};
 try{
  await act(async()=>{view=create(React.createElement(Dialog,{dialog:{native:true,type:'longText',title:'Story',page:0,pages:3},onDismiss:()=>dismissed++,onButtonEdge:(...edge)=>edges.push(edge)}));});
  const panel=view.root.findByProps({role:'dialog'});
  panel.props.onKeyDown(event(' '));panel.props.onKeyDown({...event(' '),repeat:true});panel.props.onKeyUp(event(' '));
  panel.props.onKeyDown(event('ArrowDown'));panel.props.onKeyUp(event('ArrowDown'));panel.props.onKeyDown(event('q'));
  const up=view.root.findByProps({'data-testid':'bw-arcade-dialog-up'});
  up.props.onPointerDown({pointerId:1,preventDefault(){},currentTarget:{setPointerCapture(){}}});up.props.onPointerCancel();
  assert.deepEqual(edges,[['a',true],['a',false],['down',true],['down',false],['up',true],['up',false]]);assert.equal(dismissed,0);
  panel.props.onKeyDown(event(' '));await act(async()=>view.unmount());assert.deepEqual(edges.slice(-2),[['a',true],['a',false]],'unmount releases held controller');
 }finally{globalThis.document=documentBefore;}
});

test('existing Boolean question controls keep guarded yes/no answers',async()=>{
 const answers=[];let view;const documentBefore=globalThis.document;globalThis.document={body:{}};
 try{
  await act(async()=>{view=create(React.createElement(Dialog,{dialog:{type:'ask',title:'Question',elapsed:500},onDismiss:value=>answers.push(value)}));});
  view.root.findByProps({'data-testid':'bw-arcade-question-yes'}).props.onClick();view.root.findByProps({'data-testid':'bw-arcade-question-no'}).props.onClick();assert.deepEqual(answers,[true,false]);await act(async()=>view.unmount());
 }finally{globalThis.document=documentBefore;}
});
