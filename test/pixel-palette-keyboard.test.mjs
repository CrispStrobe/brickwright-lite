import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeAfter} from './helpers/js-scope.mjs';
const source=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pixel-art-editor.jsx',import.meta.url),'utf8');
const keydown=new Function(`return function(event) ${scopeAfter(source,'    handlePaletteKeyDown (event)')}`)();
test('palette arrows stay inside the picker and update the intended foreground/background slot',()=>{
    let focused=-1;
    const buttons=Array.from({length:16},(_,i)=>({focus:()=>{focused=i;}}));
    const owner={state:{colour:2,secondaryColour:0,choosingSecondary:false},setState(next){Object.assign(this.state,next(this.state));}};
    const event=key=>({key,target:buttons[2],currentTarget:{querySelectorAll:()=>buttons},preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}});
    const down=event('ArrowDown');keydown.call(owner,down);assert.equal(focused,6);assert.equal(owner.state.colour,6);assert.equal(owner.state.secondaryColour,0);assert.equal(down.stopped,true);
    owner.state.choosingSecondary=true;keydown.call(owner,event('ArrowLeft'));assert.equal(owner.state.secondaryColour,1);assert.equal(owner.state.colour,6);
    keydown.call(owner,event('End'));assert.equal(focused,15);assert.equal(owner.state.secondaryColour,15);
});
