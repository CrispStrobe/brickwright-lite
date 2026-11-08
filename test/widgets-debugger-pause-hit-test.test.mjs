import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');

// Layout hit-test for the x86 machine GUI: with dockMode 'controller' (the
// Widgets pane) and the debugger docked right, both live in the same right
// pane. A hosted 386 event clicked the debugger's Pause and hit the Widgets
// "Full screen" button instead. This fixture is not the app: it rebuilds the
// right-pane stacking from the REAL style literals in the source (the dock
// wrapper in gui.jsx, the Widgets root in controller-panel-view.jsx and the
// circuit stage host in circuit-tab.jsx) and asks the browser which element
// is topmost at the centre of Pause.
const root=new URL('../overlay/scratch-gui/src/components/',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const kebab=k=>k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
const unitless=new Set(['zIndex','flex','opacity']);
const jsxStyleToCss=src=>[...src.matchAll(/(\w+):\s*('([^']*)'|-?[\d.]+)/g)]
    .map(([,k,v,s])=>`${kebab(k)}:${s!==undefined?s:(unitless.has(k)?v:v+'px')}`).join(';');

const gui=read('gui/gui.jsx');
const dockMatch=gui.match(/<div style=\{dockFullScreenStyle \|\| (\{[^}]*\})\}>\s*<ControllerPanelView/);
assert.ok(dockMatch,'controller dock wrapper style found in gui.jsx');
const dockCss=jsxStyleToCss(dockMatch[1]);
const panelSrc=read('tw-pseudocode/controller-panel-view.jsx');
// The Widgets root style object, bounded by the Widgets undo-surface handler
// and the nearest opening double brace before it; it must contain no brace, so nothing nested can cut it.
const panelEnd=panelSrc.indexOf("}} onPointerDown={() => activateUndoSurface('widgets')}");
const panelStart=panelSrc.lastIndexOf('{{',panelEnd)+2;
assert.ok(panelEnd>=0&&panelStart>1&&panelEnd>panelStart,'Widgets root style found in controller-panel-view.jsx');
const panelStyle=panelSrc.slice(panelStart,panelEnd);
assert.ok(!/[{}]/.test(panelStyle),'Widgets root style is one flat object');
const panelCss=jsxStyleToCss(panelStyle).replaceAll('"',"'");
assert.match(panelCss,/z-index:10/,'Widgets root keeps its own z-index');
const circuitSrc=read('tw-pseudocode/circuit-tab.jsx');
const hostMatch=circuitSrc.match(/host\.style\.cssText = '([^']*)'/);
assert.ok(hostMatch,'circuit stage host cssText found in circuit-tab.jsx');
// The z-index the host takes while it shows the debugger docked right, if
// the source sets one; otherwise the cssText value stands.
const rightZ=circuitSrc.match(/_stageHost\.style\.zIndex = rightHere \? '(-?\d+)'/);
const hostCss=hostMatch[1].replace('display:none','display:block')+(rightZ?`;z-index:${rightZ[1]}`:'');

const html=hostFirst=>{
    const host=`<div id="host" style="${hostCss}"><div style="padding:8px;padding-top:48px">
        <div data-debug-panel style="padding:10px"><button id="pause" style="margin-left:100px">Pause</button></div></div></div>`;
    const dock=`<div id="dock" style="${dockCss}"><div style="${panelCss}">
        <div data-widgets-toolbar style="display:flex;gap:8px;padding:8px 12px"><span>Controller</span>
        <button data-testid="bw-widgets-enter-fullscreen" style="padding:4px 40px">Full screen</button></div></div></div>`;
    return `<body style="margin:0"><div id="wrap" style="position:relative;display:flex;flex-direction:column;width:700px;height:900px">
        <div style="max-height:44px;height:44px;overflow:hidden;flex-shrink:0;position:relative;z-index:5"><button>header</button></div>
        ${hostFirst?host+dock:dock+host}</div></body>`;
};

// Both DOM orders: the host is appended imperatively, the dock wrapper by
// React, so which comes later is not something the layout may depend on.
for(const hostFirst of [false,true]){
    test(`debugger Pause is topmost at its centre over the Widgets pane (host ${hostFirst?'before':'after'} dock)`,async()=>{
        const browser=await chromium.launch();
        try {
            const page=await browser.newPage({viewport:{width:800,height:1000}});
            await page.setContent(html(hostFirst));
            const r=await page.evaluate(()=>{
                const pause=document.getElementById('pause').getBoundingClientRect();
                const fs=document.querySelector('[data-testid="bw-widgets-enter-fullscreen"]').getBoundingClientRect();
                const top=document.elementFromPoint(pause.x+pause.width/2,pause.y+pause.height/2);
                const overlap=!(fs.right<=pause.left||fs.left>=pause.right||fs.bottom<=pause.top||fs.top>=pause.bottom);
                return {top:top&&(top.id||top.dataset.testid||top.tagName),overlap};
            });
            assert.equal(r.overlap,true,'fixture must place Full screen over Pause, or the hit-test proves nothing');
            assert.equal(r.top,'pause');
            await page.locator('#pause').click({timeout:2000});
        }finally{await browser.close();}
    });
}
