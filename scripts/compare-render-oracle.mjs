#!/usr/bin/env node
/*
 * compare-render-oracle.mjs
 * ------------------------------------------------------------------
 * Schematic-render comparison harness for brickwright-lite.
 *
 * For every Yosys-JSON netlist under test/circuitverse and
 * test/realworld-oracles it:
 *   1. renders OURS   (bin/render-fpga.mjs        -> svg)
 *   2. renders ORACLE (netlistsvg, MIT reference  -> svg)
 *   3. rasterises both svgs to PNG (chromium headless; convert fallback)
 *   4. computes structural ground-truth from the Yosys JSON and the
 *      shared yosys-to-model.js model, then counts what OUR svg drew,
 *      flagging missing ports / dropped cells / generic-glyph gates.
 *
 * Outputs land under  <scratchpad>/render-compare/{svg,png}  and a
 * machine-readable results.json.  RE-RUN this after any renderer change
 * to regenerate everything.  DOES NOT edit renderer source.
 *
 * Setup:   install the oracle once into <OUT>/node_modules:
 *            BW_RENDER_COMPARE_OUT=/some/dir npm --prefix "$BW_RENDER_COMPARE_OUT" i netlistsvg@1.0.2
 *          needs chromium headless for rasterisation (ImageMagick convert as fallback).
 * Output:  <OUT> defaults to $TMPDIR/bw-render-compare; override with BW_RENDER_COMPARE_OUT.
 * Usage:   node scripts/compare-render-oracle.mjs [--only name1,name2]
 * ------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import {fileURLToPath} from 'url';
import {execFileSync, spawnSync} from 'child_process';
import {yosysToModel} from '../overlay/scratch-gui/src/lib/bw-fpga/yosys-to-model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WT = path.resolve(__dirname, '..');
const OUT = process.env.BW_RENDER_COMPARE_OUT || path.join(os.tmpdir(), 'bw-render-compare');
const SVG = path.join(OUT, 'svg');
const PNG = path.join(OUT, 'png');
const NETLISTSVG = path.join(OUT, 'node_modules', '.bin', 'netlistsvg');
// snap chromium is AppArmor-confined: it can only read/write NON-hidden
// files under the real $HOME, never /tmp/claude-1000.  Stage there.
const STAGE = path.join(os.homedir(), 'bw-raster');
const RENDER_TIMEOUT = 120000;
const MAX_PX = 2000;

for (const d of [SVG, PNG, STAGE]) fs.mkdirSync(d, {recursive: true});

const argOnly = (() => {
    const i = process.argv.indexOf('--only');
    return i >= 0 ? new Set(process.argv[i + 1].split(',')) : null;
})();

const CIRCUITS = [];
for (const dir of ['test/circuitverse', 'test/realworld-oracles']) {
    const abs = path.join(WT, dir);
    for (const f of fs.readdirSync(abs).filter(f => f.endsWith('.json')).sort()) {
        const name = path.basename(f, '.json');
        if (argOnly && !argOnly.has(name)) continue;
        CIRCUITS.push({name, group: dir.split('/').pop(), json: path.join(abs, f)});
    }
}

const GLYPH_TYPES = new Set(['and', 'or', 'xor', 'not', 'mux', 'pmux']);
const TYPE_MAP = {
    '$add': 'add', '$sub': 'sub', '$mul': 'mul',
    '$and': 'and', '$or': 'or', '$xor': 'xor', '$not': 'not',
    '$logic_and': 'and', '$logic_or': 'or', '$logic_not': 'not', '$reduce_or': 'reduce_or',
    '$eq': 'eq', '$ne': 'neq', '$lt': 'lt', '$gt': 'gt', '$le': 'lte', '$ge': 'gte',
    '$shl': 'shl', '$shr': 'shr', '$mux': 'mux', '$pmux': 'pmux',
    '$dff': 'dff', '$adff': 'adff',
    '$_AND_': 'and', '$_OR_': 'or', '$_XOR_': 'xor', '$_NOT_': 'not',
    '$_MUX_': 'mux', '$_DFF_P_': 'dff'
};

const findTop = (modules, requested) => {
    if (requested && modules[requested]) return requested;
    return Object.entries(modules).find(([, m]) =>
        m.attributes && m.attributes.top === '00000000000000000000000000000001')?.[0] ||
        Object.keys(modules)[0];
};

/* ---------- ground truth straight from the Yosys JSON ---------- */
function groundTruth (json) {
    const data = JSON.parse(json);
    const modules = data.modules || {};
    const topName = findTop(modules);
    const mod = modules[topName] || {};
    const inputs = [], outputs = [];
    for (const [n, p] of Object.entries(mod.ports || {})) {
        (p.direction === 'input' ? inputs : outputs).push({name: n, bits: p.bits.length});
    }
    const cellTypes = {};       // raw yosys type -> count
    const nets = new Set();
    for (const [, p] of Object.entries(mod.ports || {})) {
        for (const b of p.bits) if (typeof b === 'number') nets.add(b);
    }
    for (const [, c] of Object.entries(mod.cells || {})) {
        cellTypes[c.type] = (cellTypes[c.type] || 0) + 1;
        for (const bits of Object.values(c.connections || {})) {
            for (const b of bits) if (typeof b === 'number') nets.add(b);
        }
    }
    const cellCount = Object.values(cellTypes).reduce((a, b) => a + b, 0);
    return {topName, inputs, outputs, cellTypes, cellCount, nets: nets.size,
        moduleCount: Object.keys(modules).length};
}

/* ---------- what our renderer INTENDS to draw (shared model) ----------
 * Expansion-aware: render-fpga.mjs recursively expands child instances
 * (default --expand-depth 1, --max-expanded-instances 8), drawing the
 * children's gates/boxes too. We mirror that so the completeness counts
 * match circuits like async_counter / full_adder_from_half_adders.       */
const MAX_EXPANDED = 8;
function tallyModule (models, modName, depth, ancestors, nested, acc) {
    const model = models[modName];
    if (!model) return;
    const nodes = model.nodes || [];
    const usedNodes = new Set((model.edges || []).flatMap(e => [e.from.node, e.to.node]));
    const drawn = nodes.filter(n => n.kind !== 'const' || usedNodes.has(n.id));
    const expandable = drawn.filter(n => n.kind === 'instance' && models[n.module]);
    for (const n of drawn) {
        if (n.kind === 'in' || n.kind === 'out') {
            acc.ioBox++;
            if (!nested) acc.ioLabel++;          // nested ports carry no io-label
            if (!nested) (n.kind === 'in' ? acc.topIns : acc.topOuts).push(n.name);
        } else if (n.kind === 'const') {
            acc.ioBox++;
        } else if (n.kind === 'gate') {
            acc.gateTypes[n.type] = (acc.gateTypes[n.type] || 0) + 1;
            acc.gateClass += n.type === 'not' ? 2 : 1;
            if (!GLYPH_TYPES.has(n.type)) acc.gateLabel++;
        } else if (n.kind === 'instance') {
            acc.module++;
            const doExpand = depth > 0 && models[n.module] && !ancestors.includes(n.module) &&
                expandable.length <= MAX_EXPANDED;
            if (doExpand) tallyModule(models, n.module, depth - 1, [...ancestors, modName], true, acc);
        }
    }
}
function modelIntent (json) {
    let parsed;
    try {
        parsed = yosysToModel(json, {});
    } catch (e) {
        return {error: String(e && e.message || e)};
    }
    const acc = {ioBox: 0, ioLabel: 0, gateClass: 0, gateLabel: 0, module: 0,
        gateTypes: {}, topIns: [], topOuts: []};
    // flat (top-only) gate-type census for glyph-fidelity reporting
    const topModel = parsed.model || {nodes: []};
    const topGateTypes = {};
    for (const n of topModel.nodes || []) {
        if (n.kind === 'gate') topGateTypes[n.type] = (topGateTypes[n.type] || 0) + 1;
    }
    tallyModule(parsed.models, parsed.topModName, 1, [], false, acc);
    return {
        topName: parsed.topModName,
        edges: (topModel.edges || []).length,
        gateTypes: topGateTypes,                 // top-level types (for glyph fidelity)
        expandedGateTypes: acc.gateTypes,        // incl. expanded children
        expectGateClass: acc.gateClass,
        expectGateLabel: acc.gateLabel,
        expectModule: acc.module,
        expectIoLabel: acc.ioLabel,
        expectIoBox: acc.ioBox
    };
}

/* ---------- count what actually got drawn in an SVG ---------- */
function svgCounts (svgText) {
    const c = re => (svgText.match(re) || []).length;
    return {
        gateClass: c(/class="gate"/g),
        gateLabel: c(/class="gate-label"/g),
        module: c(/class="module(?:"| )/g),
        ioBox: c(/class="io-box/g),
        ioLabel: c(/class="io-label/g),
        wire: c(/class="wire/g),
        pin: c(/class="pin"/g)
    };
}
// the visible port names our SVG printed (io-label text)
function svgIoLabels (svgText) {
    const out = [];
    const re = /<text class="io-label[^"]*"[^>]*>([^<]*)<\/text>/g;
    let m;
    while ((m = re.exec(svgText))) out.push(m[1]);
    return out;
}

function svgDims (svgText) {
    const m = svgText.match(/<svg[^>]*\bwidth="([0-9.]+)"[^>]*\bheight="([0-9.]+)"/);
    if (m) return {w: Math.ceil(+m[1]), h: Math.ceil(+m[2])};
    const vb = svgText.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
    if (vb) return {w: Math.ceil(+vb[1]), h: Math.ceil(+vb[2])};
    return {w: 800, h: 600};
}

/* ---------- rasterise one svg -> png ---------- */
let chromiumBroken = false;
function rasterize (svgPath, pngPath, tag) {
    const svgText = fs.readFileSync(svgPath, 'utf8');
    const {w, h} = svgDims(svgText);
    const scale = Math.min(1, MAX_PX / Math.max(w, h));
    const ow = Math.max(1, Math.round(w * scale));
    const oh = Math.max(1, Math.round(h * scale));
    if (!chromiumBroken) {
        try {
            const sSvg = path.join(STAGE, `${tag}.svg`);
            const sHtml = path.join(STAGE, `${tag}.html`);
            const sPng = path.join(STAGE, `${tag}.png`);
            fs.copyFileSync(svgPath, sSvg);
            fs.writeFileSync(sHtml,
                `<body style="margin:0;background:#fff"><img src="file://${sSvg}" ` +
                `style="width:${ow}px;height:${oh}px;display:block"></body>`);
            const r = spawnSync('chromium', [
                '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
                `--screenshot=${sPng}`, `--window-size=${ow},${oh}`,
                '--default-background-color=FFFFFFFF', `file://${sHtml}`
            ], {timeout: 90000, stdio: 'ignore'});
            if (fs.existsSync(sPng)) {
                fs.copyFileSync(sPng, pngPath);
                for (const f of [sSvg, sHtml, sPng]) fs.rmSync(f, {force: true});
                return {ok: true, via: 'chromium', w: ow, h: oh};
            }
            if (r.error) throw r.error;
        } catch (e) { /* fall through to convert */ }
    }
    // fallback: ImageMagick (internal SVG renderer is poor but better than nothing)
    const r = spawnSync('convert', ['-background', 'white', '-resize', `${ow}x${oh}`,
        svgPath, pngPath], {timeout: 90000, stdio: 'ignore'});
    if (fs.existsSync(pngPath)) return {ok: true, via: 'convert', w: ow, h: oh};
    return {ok: false, via: 'none', err: r.error ? String(r.error.message) : 'no png'};
}

/* ================================================================ */
const results = [];
for (const cx of CIRCUITS) {
    process.stderr.write(`\n=== ${cx.name} (${cx.group}) ===\n`);
    const json = fs.readFileSync(cx.json, 'utf8');
    const rec = {name: cx.name, group: cx.group, bytes: json.length};

    // ground truth + intended model
    try { rec.truth = groundTruth(json); } catch (e) { rec.truth = {error: String(e.message || e)}; }
    rec.model = modelIntent(json);

    // OURS
    const oursSvg = path.join(SVG, `ours_${cx.name}.svg`);
    const t0 = Date.now();
    try {
        execFileSync('node', [path.join(WT, 'bin/render-fpga.mjs'), cx.json,
            '--output', SVG, '--format', 'svg'],
            {timeout: RENDER_TIMEOUT, stdio: ['ignore', 'ignore', 'ignore'], cwd: WT});
        const produced = path.join(SVG, `${cx.name}.svg`);
        if (fs.existsSync(produced)) fs.renameSync(produced, oursSvg);
        rec.oursMs = Date.now() - t0;
        rec.oursOk = fs.existsSync(oursSvg) && fs.statSync(oursSvg).size > 0;
    } catch (e) {
        rec.oursMs = Date.now() - t0;
        rec.oursOk = false;
        rec.oursErr = (e.killed || /ETIMEDOUT/.test(String(e.signal || e.code || e.message)))
            ? `TIMEOUT/killed after ${rec.oursMs}ms` : String(e.message || e).slice(0, 300);
    }

    // ORACLE
    const oracleSvg = path.join(SVG, `oracle_${cx.name}.svg`);
    const t1 = Date.now();
    try {
        execFileSync('node', [NETLISTSVG, cx.json, '-o', oracleSvg],
            {timeout: RENDER_TIMEOUT, stdio: ['ignore', 'ignore', 'ignore'], cwd: OUT});
        rec.oracleMs = Date.now() - t1;
        rec.oracleOk = fs.existsSync(oracleSvg) && fs.statSync(oracleSvg).size > 0;
    } catch (e) {
        rec.oracleMs = Date.now() - t1;
        rec.oracleOk = false;
        rec.oracleErr = (e.killed ? `TIMEOUT/killed after ${rec.oracleMs}ms`
            : String(e.message || e).slice(0, 300));
    }

    // structural analysis of OUR svg
    if (rec.oursOk) {
        const svgText = fs.readFileSync(oursSvg, 'utf8');
        rec.svg = svgCounts(svgText);
        rec.svgDims = svgDims(svgText);
        const shownPorts = new Set(svgIoLabels(svgText));
        const m = rec.model;
        const truth = rec.truth;
        const wantPorts = [...(truth.inputs || []), ...(truth.outputs || [])].map(p => p.name);
        rec.missingPorts = wantPorts.filter(p => !shownPorts.has(p));
        // completeness: did every intended glyph/box get drawn?
        rec.gateClassOk = !m.error && rec.svg.gateClass === m.expectGateClass;
        rec.gateLabelOk = !m.error && rec.svg.gateLabel === m.expectGateLabel;
        rec.moduleOk = !m.error && rec.svg.module === m.expectModule;
        rec.ioLabelOk = !m.error && rec.svg.ioLabel === m.expectIoLabel;
        rec.structuralPass = rec.oursOk && rec.missingPorts.length === 0 &&
            rec.gateClassOk && rec.gateLabelOk && rec.moduleOk && rec.ioLabelOk;
        // glyph fidelity: which gate types are drawn as generic labelled boxes
        rec.genericGlyphTypes = Object.keys(m.expandedGateTypes || {})
            .filter(t => !GLYPH_TYPES.has(t) && t !== 'slice' && t !== 'concat').sort();
        rec.sliceConcatBoxes = (m.expandedGateTypes?.slice || 0) + (m.expandedGateTypes?.concat || 0);
        rec.instanceTypes = Object.entries(rec.truth.cellTypes || {})
            .filter(([t]) => !(t in TYPE_MAP)).map(([t]) => t).sort();
    } else {
        rec.structuralPass = false;
    }

    // rasterise
    rec.raster = {};
    if (rec.oursOk) rec.raster.ours = rasterize(oursSvg, path.join(PNG, `ours_${cx.name}.png`), `ours_${cx.name}`);
    if (rec.oracleOk) rec.raster.oracle = rasterize(oracleSvg, path.join(PNG, `oracle_${cx.name}.png`), `oracle_${cx.name}`);

    // one-line log
    const p = rec.structuralPass ? 'PASS' : 'FAIL';
    process.stderr.write(
        `  ours=${rec.oursOk ? 'ok' : 'FAIL'}(${rec.oursMs}ms) oracle=${rec.oracleOk ? 'ok' : 'FAIL'}(${rec.oracleMs}ms) ` +
        `struct=${p} cells=${rec.truth.cellCount} ` +
        `missPorts=${(rec.missingPorts || []).length} ` +
        `gateClass=${rec.svg ? rec.svg.gateClass : '-'}/${rec.model.expectGateClass ?? '-'}\n`);
    results.push(rec);
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
process.stderr.write(`\nWrote ${path.join(OUT, 'results.json')} (${results.length} circuits)\n`);

// compact table to stdout
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('circuit', 34) + pad('grp', 6) + pad('ours', 6) + pad('oracle', 7) + pad('struct', 8) +
    pad('cells', 7) + pad('missP', 7) + 'gateClass');
for (const r of results) {
    console.log(
        pad(r.name, 34) + pad(r.group.slice(0, 5), 6) +
        pad(r.oursOk ? 'ok' : 'FAIL', 6) + pad(r.oracleOk ? 'ok' : 'FAIL', 7) +
        pad(r.structuralPass ? 'pass' : 'FAIL', 8) +
        pad(r.truth.cellCount ?? '?', 7) +
        pad((r.missingPorts || []).length, 7) +
        `${r.svg ? r.svg.gateClass : '-'}/${r.model.expectGateClass ?? '-'}`);
}
