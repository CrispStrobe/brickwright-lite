// Component microbenchmarks complement (not replace) full execution profiles.
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const root = resolve('.'), baseline = resolve(process.env.I8086_BASELINE || '.');
const output = resolve('artifacts/i8086-execution');
const sha = cwd => execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim();
const identity = {baseline:sha(baseline),candidate:sha(root),runId:process.env.GITHUB_RUN_ID};
const roots = {baseline, candidate:root};
const server = createServer(async (req,res) => {
    try {
        const [,kind,...parts] = new URL(req.url,'http://localhost').pathname.split('/');
        if (!roots[kind]) { res.writeHead(404).end(); return; }
        if (!parts.join('/')) { res.end('<!doctype html><title>Device cost</title>'); return; }
        const from = parts.join('/') === 'scripts/lib/i8086-device-workload.mjs' ? root : roots[kind];
        const path = resolve(from,...parts);
        if (!path.startsWith(from+sep)) throw new Error('Path escape');
        res.setHeader('Content-Type','text/javascript'); res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
});
await mkdir(output,{recursive:true});
await new Promise(done => server.listen(0,'127.0.0.1',done));
const browser = await chromium.launch({headless:true});
const rows = [], comparisons = [];
let complete = false;
try {
    for (const rate of [1,4]) for (const name of ['dispatch','pit-idle','pit-active','pit-three','cga','pit-cga']) {
        let reference;
        for (let repetition=0;repetition<5;repetition++) for (const kind of repetition%2 ? ['candidate','baseline'] : ['baseline','candidate']) {
            const context = await browser.newContext();
            try {
                const page = await context.newPage(), cdp = await context.newCDPSession(page);
                await cdp.send('Emulation.setCPUThrottlingRate',{rate});
                await page.goto(`http://127.0.0.1:${server.address().port}/${kind}/`);
                const result = await page.evaluate(async ({kind,name}) => {
                    const {setupDevices} = await import(`/${kind}/scripts/lib/i8086-device-workload.mjs`);
                    const bench = setupDevices(name); bench.run(); return bench.run();
                },{kind,name});
                const state = JSON.stringify(result.state);
                if (reference && reference !== state) throw new Error(`Device state/callback mismatch: ${name}`);
                reference = state;
                rows.push({kind,rate,name,repetition,...result});
            } finally { await context.close(); }
        }
        const spread = kind => {
            const v = rows.filter(x=>x.kind===kind && x.rate===rate && x.name===name).map(x=>x.nsPerAdvance).sort((a,b)=>a-b);
            return {min:v[0],median:v[2],max:v[4]};
        };
        const before=spread('baseline'), after=spread('candidate');
        const row={name,rate,baseline:before,candidate:after,change:100*(before.median/after.median-1),
            separated:after.max<before.min || before.max<after.min};
        comparisons.push(row); console.log(JSON.stringify(row));
    }
    complete=true;
} finally {
    await writeFile(resolve(output,'devices.json'),JSON.stringify({identity,complete,rows,comparisons},null,2));
    await browser.close(); await new Promise(done=>server.close(done));
}
