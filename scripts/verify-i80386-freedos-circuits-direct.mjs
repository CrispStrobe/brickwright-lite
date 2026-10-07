/** Materialize one exact-source FreeDOS browser probe with direct Circuit input. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const parentPath=join(root,'scripts/verify-i80386-freedos-real-browser.mjs');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const parentSha256='0cb78e14ac17c882fa4bfe62d65320f5fe27d66891d76ccaa1cd01436d75fc92';
const circuitAnchor="        await page.getByRole('tab',{name:/Circuit/}).click();\n";
const reportAnchor='        interactions = {before,fullscreen,resized,circuitTargetPreserved:true,beforeTabs,afterTabs,tabText,guestMousePacket:';
const observedAnchor="        assert.match(tabText,/PS2 DONE/,'guest mouse-program output survives tab roundtrip');";

const circuitBlock=`        let circuitDirect=null;
        try {
        const vdp=page.locator('[data-vdp-screen]:visible').first();
        await vdp.waitFor({state:'visible',timeout:30000});
        await vdp.click();
        assert.equal(await vdp.evaluate(el=>document.activeElement===el),true,'actual Circuit VDP has keyboard focus');
        const vdpCanvas=vdp.locator('canvas');
        const circuitTextObserver=\`canvas => (\${decodeTextPixels.toString()})({mode:3,width:canvas.width,height:canvas.height,rgba:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data},\${JSON.stringify(fixedTextGlyphs())})\`;
        const circuitText=()=>vdpCanvas.evaluate(circuitTextObserver);
        const circuitShot=async label=>{const file=join(output,label+'.png');const bytes=await vdpCanvas.screenshot({path:file});return {file,sha256:sha256(bytes)};};
        let circuitBeforeText='',circuitBeforeError='';const circuitReadyDeadline=Date.now()+30000;
        while(Date.now()<circuitReadyDeadline){
            try {circuitBeforeText=await circuitText();if(/PS2 DONE/.test(circuitBeforeText))break;}
            catch(error) {circuitBeforeError=String(error);}
            await waitForGuestTime(100_000_000);
        }
        assert.match(circuitBeforeText,/PS2 DONE/,'actual Circuit VDP pixels retain prior guest output: '+circuitBeforeError);
        const circuitBefore={timeNs:Number(await page.evaluate(()=>window.__benchTarget.timeNs())),screen:await circuitShot('circuit-before'),text:circuitBeforeText};
        for(const key of ['e','c','h','o','Space','c','i','r','c','u','i','t','o','k','Enter']){
            await page.keyboard.press(key);
            await waitForGuestTime(100_000_000);
        }
        let circuitAfterText='';const circuitDeadline=Date.now()+30000;
        while(Date.now()<circuitDeadline){
            circuitAfterText=await circuitText();
            if(/^circuitok\\s*$/m.test(circuitAfterText))break;
            await waitForGuestTime(100_000_000);
        }
        circuitDirect={before:circuitBefore,after:{timeNs:Number(await page.evaluate(()=>window.__benchTarget.timeNs())),
            screen:await circuitShot('circuit-after'),text:circuitAfterText},focused:await vdp.evaluate(el=>document.activeElement===el),
            tabSelected:await page.getByRole('tab',{name:/Circuit/}).getAttribute('aria-selected'),keys:'echo circuitok,Enter'};
        await writeFile(join(output,'circuit-direct.json'),JSON.stringify(circuitDirect,null,2)+'\\n');
        assert.equal(circuitDirect.tabSelected,'true','guest response observed while Circuit tab is selected');
        assert.equal(circuitDirect.focused,true,'Circuit VDP remains focused after physical keys');
        assert.match(circuitAfterText,/^circuitok\\s*$/m,'actual Circuit VDP pixels show guest shell response');
        assert.ok(circuitDirect.after.timeNs>=circuitBefore.timeNs,'guest clock continues through Circuit input');
        } catch(error) {
            const failure={error:String(error),phase:'Circuit direct input',partial:circuitDirect,
                timeNs:await page.evaluate(()=>String(window.__benchTarget?.timeNs?.())).catch(e=>String(e)),
                guestText:await guestText().catch(e=>String(e)),
                visibleVdp:await page.locator('[data-vdp-screen]:visible').count().catch(()=>-1)};
            try {const file=join(output,'circuit-failure.png');const bytes=await page.screenshot({path:file});failure.screen={file,sha256:sha256(bytes)};} catch(screenError) {failure.screenError=String(screenError);}
            await writeFile(join(output,'circuit-direct-failure.json'),JSON.stringify(failure,null,2)+'\\n');
            throw error;
        }
`;

function replaceOnce(source,old,next,label,edits){
 assert.equal(source.split(old).length,2,'one '+label+' seam');
 edits.push({old,next,label});
 return source.replace(old,next);
}
export function deriveCircuitsProbe(){
 const parent=readFileSync(parentPath,'utf8');
 assert.equal(sha256(parent),parentSha256,'exact accepted FreeDOS interaction probe');
 const edits=[];
 let generated=replaceOnce(parent,circuitAnchor,circuitAnchor+circuitBlock,'Circuit tab',edits);
 generated=replaceOnce(generated,observedAnchor,observedAnchor+"\n        assert.match(tabText,/^circuitok\\s*$/m,'Circuit guest output survives Code return');",'Code continuity',edits);
 generated=replaceOnce(generated,reportAnchor,reportAnchor.replace('guestMousePacket:','circuitDirect,guestMousePacket:'),'interaction receipt',edits);
 generated=replaceOnce(generated,"schema:'brickwright-lite.i80386-freedos-real-browser.v1'", "schema:'brickwright-lite.i80386-freedos-circuits-direct.v1'",'success schema',edits);
 generated=replaceOnce(generated,"schema:'brickwright-lite.i80386-freedos-real-browser-failure.v1'", "schema:'brickwright-lite.i80386-freedos-circuits-direct-failure.v1'",'failure schema',edits);
 generated=replaceOnce(generated,"const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');",'const root = resolve(process.env.FREEDOS_PROBE_REPO_ROOT || process.cwd());','separate generated module root',edits);
 for(const specifier of ['playwright','./lib/i80386-freedos-interaction.mjs','./lib/i80386-vga-text.mjs']){
  const absolute=specifier==='playwright'?new URL('../node_modules/playwright/index.mjs',import.meta.url):new URL(specifier,import.meta.url);
  generated=replaceOnce(generated,`from '${specifier}';`,`from '${absolute.href}';`,'materialized import '+specifier,edits);
 }
 assert.ok(!generated.includes('window.__benchTarget.keyIn('),'input must use the Circuit VDP browser path');
 let inverse=generated;
 for(const edit of [...edits].reverse())inverse=replaceOnce(inverse,edit.next,edit.old,'inverse '+edit.label,[]);
 assert.equal(inverse,parent,'exact probe inverse');
 return {parentSha256,generatedSha256:sha256(generated),generated};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,3,'usage: node verify-i80386-freedos-circuits-direct.mjs OUTPUT_MJS');
 const output=process.argv[2];assert.ok(isAbsolute(output)&&resolve(output)===output,'canonical absolute output path');
 const expected=process.env.BW_EXPECTED_HEAD;
 assert.match(expected??'',/^[a-f0-9]{40}$/,'reviewed exact Lite head');
 const result=deriveCircuitsProbe();
 writeFileSync(output,result.generated,{flag:'wx'});
 writeFileSync(output+'.source.json',JSON.stringify({schema:'brickwright-lite.i80386-freedos-circuits-source.v1',
  probeHead:expected,parentSha256:result.parentSha256,generatedSha256:result.generatedSha256},null,2)+'\n',{flag:'wx'});
 process.stdout.write(JSON.stringify({probeHead:expected,parentSha256:result.parentSha256,generatedSha256:result.generatedSha256})+'\n');
}
