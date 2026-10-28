import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {waitForArcadeStageFrame} from '../scripts/lib/arcade-stage-frame.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');

// Browser canvas observation controls only: this fixture is not the app or a
// substitute VM. It proves the wait predicate; full IDE acceptance is separate.
test('full presented-frame wait stays blocked on a single differing pixel until real paint',async()=>{
    const browser=await chromium.launch();
    try {
        const page=await browser.newPage();
        await page.setContent('<canvas id="presented" width="320" height="240"></canvas><button id="paint">Paint</button>');
        await page.evaluate(()=>{
            const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
            ctx.fillStyle='#336699';ctx.fillRect(0,0,320,240);ctx.fillStyle='#ff0000';ctx.fillRect(318,238,2,2);
            window.__brickwrightStore={getState:()=>({scratchGui:{vm:{runtime:{renderer:{canvas}}}}})};
            document.querySelector('button').onclick=()=>{ctx.fillStyle='#336699';ctx.fillRect(318,238,2,2);};
        });
        const expected=Array(19200).fill(0xff996633);let done=false;
        const waiting=waitForArcadeStageFrame(page,expected,{timeout:5000}).then(frame=>{done=true;return frame;});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert.equal(done,false,'a final-pixel mismatch must not pass a partial frame');
        await page.getByRole('button',{name:'Paint'}).click();
        assert.deepEqual(await waiting,expected);
    }finally{await browser.close();}
});
test('zero-size presentation and incomplete expected frames cannot pass vacuously',async()=>{
    const browser=await chromium.launch();
    try {
        const page=await browser.newPage();await page.setContent('<canvas width="0" height="0"></canvas><button>Present</button>');
        await page.evaluate(()=>{
            const canvas=document.querySelector('canvas');window.__brickwrightStore={getState:()=>({scratchGui:{vm:{runtime:{renderer:{canvas}}}}})};
            document.querySelector('button').onclick=()=>{canvas.width=160;canvas.height=120;canvas.getContext('2d').fillRect(0,0,160,120);};
        });
        await assert.rejects(waitForArcadeStageFrame(page,Array(19199).fill(0xff000000)),/full Arcade frame/);
        let done=false;const waiting=waitForArcadeStageFrame(page,Array(19200).fill(0xff000000),{timeout:5000}).then(frame=>{done=true;return frame;});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(done,false);
        await page.getByRole('button',{name:'Present'}).click();assert.equal((await waiting).length,19200);
    }finally{await browser.close();}
});
