#!/usr/bin/env node
// Fresh source component qualification. The VM/runtime integration boundary is
// covered separately by arcade-project-palette-authoring.test.mjs; this browser
// harness uses the real Blocks container and records live primitive calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=process.cwd(),require=createRequire(path.join(root,'packages/scratch-gui/package.json'));
const webpack=require('webpack'),out=path.resolve('artifacts/project-palette-editor-browser');
await fs.mkdir(out,{recursive:true});
const entry=path.join(out,'entry.jsx');
await fs.writeFile(entry,`
import React from 'react';import ReactDOM from 'react-dom';
import Blocks from ${JSON.stringify(path.join(root,'packages/scratch-gui/node_modules/scratch-vm/src/engine/blocks.js'))};
import Editor from ${JSON.stringify(path.join(root,'overlay/scratch-gui/src/components/tw-pseudocode/project-palette-editor.jsx'))};
import {DEFAULT_PROJECT_PALETTE,inspectProjectPalette} from ${JSON.stringify(path.join(root,'overlay/scratch-gui/src/lib/arcade-project-palette.js'))};
const runtime={targets:[],emitProjectChanged(){},emit(){},requestBlocksUpdate(){},_primitives:{arcade_setPalette({DATA}){window.livePalette=DATA;}}};
const target={id:'stage',isStage:true,isOriginal:true,blocks:new Blocks(runtime)};
runtime.targets=[target];runtime.getTargetForStage=()=>target;
const vm={runtime,editingTarget:target,emitWorkspaceUpdate(){}};
window.inspect=()=>inspectProjectPalette(vm);window.blocks=target.blocks;
class Harness extends React.Component {state={preview:null};render(){return <Editor vm={vm} locale={new URLSearchParams(location.search).get('locale')||'en'} image={{width:2,height:1,pixels:[1,2]}} artworkPalette={[null,...DEFAULT_PROJECT_PALETTE.slice(1)]} previewing={Boolean(this.state.preview)} onPreview={preview=>{window.preview=preview;this.setState({preview});}}/>;}}
ReactDOM.render(<Harness/>,document.getElementById('root'));
`);
await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,entry,output:{path:out,filename:'bundle.js'},
 resolve:{modules:[path.join(root,'packages/scratch-gui/node_modules'),'node_modules'],fallback:{util:false}},
 module:{rules:[{test:/\.jsx$/,use:{loader:require.resolve('babel-loader'),options:{babelrc:false,configFile:false,presets:[require.resolve('@babel/preset-react')]}}}]}
}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(new Error(stats.toString({all:false,errors:true}))):resolve()));
const server=createServer(async(req,res)=>{if(req.url.startsWith('/bundle.js'))res.end(await fs.readFile(path.join(out,'bundle.js')));
 else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta charset="utf-8"><style>body{font-family:Arial,sans-serif}</style><div id="root" style="width:300px"></div><script src="/bundle.js"></script>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:420,height:900}});
const report={boundary:'fresh React component + real Scratch Blocks; live palette primitive recorded, full app qualification remains separate',locales:[],errors:[]};
page.on('pageerror',error=>report.errors.push(error.message));
try{for(const locale of ['en','de']){
 await page.goto(`http://127.0.0.1:${server.address().port}/?locale=${locale}`);
 assert.equal(await page.locator('input[type=color]').count(),16);
 await page.getByTestId('bw-project-palette-color-1').fill('#123456');
 await page.getByTestId('bw-project-palette-use-preview').check();
 assert.equal(await page.evaluate(()=>window.preview[1]),'#123456');
 assert.equal(await page.evaluate(()=>window.inspect().kind),'default','preview does not mutate project');
 await page.getByTestId('bw-project-palette-apply').click();await page.getByRole('status').waitFor();
 assert.equal(await page.evaluate(()=>window.inspect().colors[1]),'#123456');
 assert.equal(await page.evaluate(()=>window.livePalette.slice(6,12)),'123456');
 await page.getByTestId('bw-project-palette-color-2').fill('#123456');
 assert.equal(await page.evaluate(()=>window.preview[2]),'#123456');
 // Simulate a real concurrent Blocks edit, then verify stale-dialog protection.
 await page.evaluate(()=>{const start=window.inspect().start;window.blocks.changeBlock({id:start.literal.text.id,element:'field',name:'TEXT',value:'000000'.repeat(16)});});
 await page.getByTestId('bw-project-palette-apply').click();await page.getByRole('alert').waitFor();
 assert.equal(await page.evaluate(()=>window.inspect().colors[1]),'#000000');
 await page.getByTestId('bw-project-palette-reload').click();
 const overflow=await page.locator('[data-testid="bw-project-palette"] button').evaluateAll(nodes=>nodes.filter(node=>node.scrollWidth>node.clientWidth+1).map(node=>node.textContent));
 assert.deepEqual(overflow,[],`${locale} button text fits`);
 await page.screenshot({path:path.join(out,`${locale}.png`),fullPage:true});
 report.locales.push({locale,colors:16,previewDoesNotMutate:true,persisted:true,staleProtected:true,overflow});
}assert.deepEqual(report.errors,[]);
}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify(report));
