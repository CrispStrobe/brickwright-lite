// Ad-hoc (never committed; copy into scripts/ to run): app speed per model — simulated time per wall second
// and frames drawn per second, every motor at 60 %. Usage: node scripts/app-perf.mjs a.mpd,b.mpd
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openRobotLabTab} from './lib/sim-lab-toolbar-gate.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const build = resolve(`${root}/packages/scratch-gui/build`);
const [model] = process.argv.slice(2);
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png'};
const server = createServer(async (rq, rs) => {
    try {
        const name = decodeURIComponent(rq.url.split('?')[0]);
        const file = resolve(build, `.${name.endsWith('/') ? `${name}index.html` : name}`);
        if (!file.startsWith(`${build}${sep}`)) throw new Error('x');
        const data = await readFile(file);
        // ISOLATE=1: cross-origin isolated (SharedArrayBuffer), as a host would serve it for Jolt's threads.
        const iso = process.env.ISOLATE ? {'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless'} : {};
        rs.writeHead(200, {'content-type': types[extname(file).toLowerCase()] || 'application/octet-stream', ...iso}); rs.end(data);
    } catch { rs.writeHead(404); rs.end(); }
});
await new Promise(d => server.listen(0, '127.0.0.1', d));
// GL=metal: the Mac's GPU through ANGLE (frame rates mean something); default: SwiftShader, as the gates run.
const GL = process.env.GL === 'metal' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
    : ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
const browser = await chromium.launch({headless: true, args: ['--disable-dev-shm-usage', ...GL]});
const page = await browser.newPage({viewport: {width: 1400, height: 950}, serviceWorkers: 'block'});
if (process.env.REDUCE) await page.emulateMedia({reducedMotion: 'reduce'});
const errors = [];
page.on('pageerror', e => errors.push(process.env.STACKS ? `${e.message} @ ${(e.stack || '').split('\n').slice(1, 4).join(' | ')}` : e.message));
if (process.env.STACKS) page.on('console', m => { if (m.type() === 'error' || /jolt|worker|pthread/i.test(m.text())) console.log('console', m.type(), m.text().slice(0, 300)); });
if (process.env.STACKS) page.on('worker', w => console.log('worker', w.url().slice(-80)));
await page.addInitScript(() => { localStorage.clear(); localStorage.setItem('bw-starter-v1-complete', '1'); localStorage.setItem('bw-right-pane-hidden', '1'); });
await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'domcontentloaded', timeout: 90000});
await page.getByRole('tab', {name: /^(Code|Skripte)$/}).click();
await page.getByTestId('bw-device-select').waitFor({timeout: 60000});
await openRobotLabTab(page);
await page.waitForFunction(() => window.__bwSimLab?.status === 'ready', null, {timeout: 90000});
const {readFileSync} = await import('node:fs');
for (const f of model.split(',')) {
  try {
    const t0 = Date.now();
    const reqs = [];
    const onReq = r => { const t = Date.now(); r.response().then(() => reqs.push({url: r.url(), ms: Date.now() - t, at: t - t0})).catch(() => {}); };
    if (process.env.REQS) page.on('request', onReq);
    let cdp = null;
    if (process.env.PROFILE_LOAD) {
        cdp = await page.context().newCDPSession(page);
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', {interval: 500});
        await cdp.send('Profiler.start');
    }
    const loadRes = await page.evaluate(t => window.__bwSimLab.api.loadModel(t), readFileSync(f, 'latin1'));
    await page.waitForFunction(() => window.__bwSimLab.status === 'ready' || window.__bwSimLab.status === 'failed', null, {timeout: 240000});
    const loadMs = Date.now() - t0;
    const state = await page.evaluate(() => ({status: window.__bwSimLab.status, hasSession: Boolean(window.__bwSimLab._pane.session),
        issues: window.__bwSimLab.issues.filter(i => i.severity === 'error').map(i => `${i.code}: ${(i.message || '').slice(0, 200)}`)}));
    if (!state.hasSession) console.log('no session', JSON.stringify(state), 'loadModel:', JSON.stringify(loadRes).slice(0, 400),
        JSON.stringify(await page.evaluate(() => ({message: window.__bwSimLab._pane.state.message, firmware: window.__bwSimLab._pane.state.firmwareUnsupported || null}))).slice(0, 600));
    if (process.env.REQS) {
        page.off('request', onReq);
        const byHost = {};
        for (const q of reqs) { const h = new URL(q.url).host + ' ' + new URL(q.url).pathname.split('/').slice(0, 3).join('/'); (byHost[h] = byHost[h] || {n: 0, ms: 0, max: 0}); byHost[h].n++; byHost[h].ms += q.ms; byHost[h].max = Math.max(byHost[h].max, q.ms); }
        console.log('requests', reqs.length, JSON.stringify(byHost));
        const last = reqs.map(q => q.at + q.ms).sort((x, y) => y - x)[0];
        console.log('last request done at', last, 'ms of', loadMs);
    }
    if (cdp) {
        const {profile} = await cdp.send('Profiler.stop');
        (await import('node:fs')).writeFileSync(process.env.PROFILE_LOAD, JSON.stringify(profile));
        cdp = null;
    }
    if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(await page.evaluate(() => window.__bwSimLab._pane.session.mechanism)));
    const r = await page.evaluate(async () => {
        const api = window.__bwSimLab.api; const s = window.__bwSimLab._pane.session;
        for (const m of api.motors()) api.setMotor(m.id, {power: 60});
        await api.start();
        await new Promise(d => setTimeout(d, 1000));
        let frames = 0; let on = true;
        const tick = () => { frames++; if (on) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        const st0 = {...(s.stats || {})};
        const sim0 = s.time; const w0 = performance.now();
        await new Promise(d => setTimeout(d, 6000));
        on = false;
        const wall = (performance.now() - w0) / 1000;
        const gl = document.querySelector('[data-testid="bw-sim-lab-3d-canvas"] canvas, canvas')?.getContext('webgl2');
        const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
        const st = s.stats || {};
        const d = k => (st[k] || 0) - (st0[k] || 0);
        const batches = d('batches') || 1;
        const pstats = {batches: d('batches'), stepsPerBatch: +(d('steps') / batches).toFixed(1), workerMsPerBatch: +(d('workerMs') / batches).toFixed(1),
            mainMsPerBatch: +(d('mainMs') / batches).toFixed(1), roundTripMs: +(d('roundTripMs') / batches).toFixed(1), redos: d('redos'), droppedMs: d('droppedMs')};
        const out = {isolated: globalThis.crossOriginIsolated, pstats, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL).slice(0, 40) : '?', simPerWall: +((s.time - sim0) / 1000 / wall).toFixed(3), fps: +(frames / wall).toFixed(1),
            bodies: s.mechanism.bodies.length, parts: s.model.parts.length, motors: api.motors().length};
        for (const m of api.motors()) api.stopMotor(m.id);
        api.stop && api.stop();
        return out;
    });
    console.log(JSON.stringify({model: f.split('/').pop(), loadMs, ...r}));
  } catch (e) {
    console.log(JSON.stringify({model: f.split('/').pop(), failed: e.message.split('\n')[0].slice(0, 200)}));
    await page.reload().catch(() => {});
    await page.getByRole('tab', {name: /^(Code|Skripte)$/}).click().catch(() => {});
    await openRobotLabTab(page).catch(() => {});
    await page.waitForFunction(() => window.__bwSimLab?.status === 'ready', null, {timeout: 90000}).catch(() => {});
  }
}
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
server.close();
