#!/usr/bin/env node
/**
 * The MakeCode round-trip census: how much of real micro:bit code survives
 * lite, stage by stage, measured on real programs rather than asserted.
 *
 * TWO CORPORA
 *   makecode  MakeCode's own documentation inside the pinned pxt-microbit
 *             tarball (sync:makecode): every ```blocks / ```typescript program.
 *             `apps` = the LAST program of each project/lesson/course/tutorial
 *             page — the finished app a tutorial builds; `--snippets` adds every
 *             block on every page (API coverage).
 *   lite      every pseudocode program lite ships (examples/**.bw), retargeted
 *             to the micro:bit (its DEVICE line replaced), because the dialect
 *             is shared and "pseudocode -> micro:bit .hex" should hold for all
 *             of it in the end.
 *
 * STAGES (each program goes as far as it can; the first failure is its row)
 *   makecode programs:
 *     baseline   pxt compiles the original (else: needs an extension, or a
 *                snippet that is not a whole program — excluded from the rest)
 *     import     microbitToPseudocode: how many calls were named unsupported
 *     parse      the pseudocode parses (SB3Creator)
 *     sim        generateMicroPython succeeds — the program runs in our simulator
 *     export     pseudocode -> MakeCode TypeScript (export.js)
 *     recompile  pxt compiles the re-export (simulator build)
 *     SILENT     a MakeCode call in the original that is in neither the
 *                re-export nor the unsupported list: dropped without a word
 *   lite programs: parse -> export -> recompile (+ the export's own unsupported list).
 *
 * Needs the synced runtime (npm run sync:makecode). Writes
 * docs/generated/MAKECODE-CENSUS.md and test-results/makecode-census.json.
 *
 *   node scripts/makecode-census.mjs [--snippets] [--limit N] [--only makecode|lite]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode');
const SRC = path.join(ROOT, 'overlay/scratch-gui/src/lib');
const imp = rel => import(pathToFileURL(path.join(SRC, rel)).href);
const {PXT_GLUE_JS} = await imp('bw-makecode/pxt-runtime.js');
const {microbitToPseudocode} = await imp('bw-makecode/microbit-translate.js');
const {exportToMakeCode} = await imp('bw-makecode/export.js');
const {default: SB3Creator} = await imp('sb3-creator.js');
const {untar, CACHE_DIR} = await import(pathToFileURL(path.join(ROOT, 'scripts/sync-makecode-runtime.mjs')).href);

const arg = name => process.argv.includes(name);
const argVal = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const LIMIT = Number(argVal('--limit', 0)) || Infinity;
const ONLY = argVal('--only', null);

if (!fs.existsSync(path.join(STATIC, 'microbit/pxtworker.js'))) {
    console.error('MakeCode runtime not synced: run `npm run sync:makecode` first');
    process.exit(2);
}

// ── pxt, as the worker runs it ──────────────────────────────────────────
const sb = {
    setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
    TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
    console: {log () {}, debug () {}, info () {}, warn () {}, error () {}},
    pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(STATIC, 'microbit/target.json'), 'utf8'))
};
sb.global = sb;
sb.self = sb;
sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
vm.runInContext(fs.readFileSync(path.join(STATIC, 'microbit/pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
const PXT_JSON = JSON.stringify({name: 'census', dependencies: {core: '*', radio: '*', microphone: '*'}, files: ['main.ts']});
async function pxtCompile (ts) {
    try {
        const r = JSON.parse(JSON.stringify(await sb.bwMakeCode.compile({'pxt.json': PXT_JSON, 'main.ts': ts}, {})));
        return {ok: r.success, error: r.success ? '' : ((r.diagnostics[0] || {}).message || 'failed'), net: r.netAttempts.length};
    } catch (e) {
        return {ok: false, error: String(e && e.message || e).slice(0, 160), net: 0};
    }
}

// ── MakeCode calls, for the silent-loss comparison ──────────────────────
const NAMESPACES = ['basic', 'input', 'led', 'music', 'radio', 'pins', 'game', 'images', 'serial', 'control',
    'Math', 'bluetooth', 'datalogger', 'servos', 'power', 'loops', 'logic', 'text', 'console', 'randint'];
/** A MakeCode call and what the round trip legitimately turns it into. */
const TRANSFORMS = {
    'input.onButtonPressed': 'input.buttonIsPressed',
    'input.onGesture': 'input.isGesture',
    'input.onPinPressed': 'input.pinIsPressed',
    // The same function under two names (pxt-microbit: Math.map is pins.map);
    // the dialect has one `map … from low … high …` block, which goes back as pins.map.
    'Math.map': 'pins.map',
    // Used as a VALUE (not a condition), a coin toss is the dialect's number
    // truth, `pick random 0 to 1`, and goes back as randint(0, 1) — the same
    // 0/1 the dialect stores. As a condition it round-trips by name.
    'Math.randomBoolean': 'randint'
};
/** ts with the argument list of every call named in `unsupported` removed (paren-matched). */
function withoutNamedCalls (ts, unsupported) {
    let out = ts;
    for (const u of unsupported) {
        // Any dotted path: `client.sprite.setBrightness()` is named as a whole,
        // and a call inside ITS arguments is covered by that name too.
        const m = String(u).match(/^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)\(\)/);
        if (!m) continue;
        let from = 0;
        for (;;) {
            const at = out.indexOf(`${m[1]}(`, from);
            if (at < 0) break;
            let depth = 0;
            let i = at + m[1].length;
            for (; i < out.length; i++) {
                if (out[i] === '(') depth++;
                else if (out[i] === ')' && --depth === 0) break;
            }
            out = `${out.slice(0, at + m[1].length)}()${out.slice(i + 1)}`;
            from = at + m[1].length + 2;
        }
    }
    return out;
}
function calls (ts) {
    const out = new Set();
    for (const m of ts.matchAll(/\b([a-zA-Z_]+)\.([a-zA-Z_]+)\s*\(/g)) if (NAMESPACES.includes(m[1])) out.add(`${m[1]}.${m[2]}`);
    for (const m of ts.matchAll(/\b(randint)\s*\(/g)) out.add(m[1]);
    return out;
}

// ── corpus: MakeCode's docs ─────────────────────────────────────────────
function makecodePrograms () {
    const tar = untar(fs.readFileSync(path.join(CACHE_DIR, 'pxt-microbit-9.1.1.tgz')));
    const programs = [];
    const seen = new Set();
    for (const [name, bytes] of [...tar.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (!name.startsWith('docs/') || !name.endsWith('.md')) continue;
        const text = bytes.toString('utf8');
        const blocks = [...text.matchAll(/```(blocks|typescript|block)\n([\s\S]*?)```/g)].map(m => m[2]);
        if (!blocks.length) continue;
        const needsPackage = /```package\n/.test(text);
        const isApp = /^docs\/(projects|lessons|courses|tutorials|examples)\//.test(name);
        const pick = arg('--snippets') ? blocks.map((b, i) => [b, i]) : (isApp ? [[blocks[blocks.length - 1], blocks.length - 1]] : []);
        for (const [code, i] of pick) {
            const key = code.replace(/\s+/g, ' ').trim();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            programs.push({id: `${name.replace(/^docs\//, '').replace(/\.md$/, '')}#${i}`, ts: code, needsPackage, isApp});
        }
    }
    return programs;
}

// ── corpus: lite's own pseudocode ───────────────────────────────────────
function litePrograms () {
    const files = execFileSync('git', ['ls-files', '*.bw'], {cwd: ROOT, encoding: 'utf8'}).split('\n').filter(Boolean);
    return files.map(f => {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        const device = (src.match(/^DEVICE\s+([^\s:]+)/m) || [])[1] || '(none)';
        const retargeted = /^DEVICE\s+/m.test(src) ? src.replace(/^DEVICE\s+[^\n]*/m, 'DEVICE MICROBIT') : `DEVICE MICROBIT\n${src}`;
        return {id: f.replace(/^overlay\/scratch-gui\/examples\//, '').replace(/\/program\.bw$/, ''), device: device.toUpperCase(), src: retargeted};
    });
}

// ── the census ──────────────────────────────────────────────────────────
const t0 = Date.now();
const results = {makecode: [], lite: []};

if (ONLY !== 'lite') {
    const programs = makecodePrograms().slice(0, LIMIT);
    let n = 0;
    for (const p of programs) {
        const row = {id: p.id, app: p.isApp};
        const base = await pxtCompile(p.ts);
        if (!base.ok) {
            row.stage = p.needsPackage || base.net ? 'needs-extension' : 'not-a-program';
            row.detail = base.error;
            results.makecode.push(row);
            continue;
        }
        let imported;
        try { imported = microbitToPseudocode(p.ts, {name: p.id}); } catch (e) { row.stage = 'import-threw'; row.detail = e.message; results.makecode.push(row); continue; }
        row.unsupported = imported.unsupported.map(String);
        let project;
        try { project = new SB3Creator().parse(imported.code); } catch (e) { row.stage = 'parse'; row.detail = e.message; results.makecode.push(row); continue; }
        try {
            const creator = new SB3Creator();
            creator.parse(imported.code);
            const mp = creator.generateMicroPython();
            row.sim = !!mp.ok;
            if (!mp.ok) row.simReasons = (mp.reasons || []).slice(0, 3);
        } catch (e) { row.sim = false; row.simReasons = [e.message]; }
        let ex;
        try { ex = exportToMakeCode(project, {name: 'rt'}); } catch (e) { row.stage = 'export-threw'; row.detail = e.message; results.makecode.push(row); continue; }
        row.exportUnsupported = ex.unsupported.map(String);
        const re = await pxtCompile(ex.ts);
        row.recompiles = re.ok;
        if (!re.ok) row.recompileError = re.error;
        // A call nested INSIDE a call the import already named unsupported
        // (input.acceleration as led.plotBarGraph's argument) is covered by that
        // name: cut each named call's argument list out before counting.
        const before = calls(withoutNamedCalls(p.ts, row.unsupported));
        const after = calls(ex.ts);
        const said = [...row.unsupported, ...row.exportUnsupported].join(' ');
        row.lost = [...before].filter(c => !after.has(c));
        // Designed transformations, not losses: the importer turns MakeCode's
        // event handlers into polling scripts (microbit-translate.js, EVENT
        // HANDLERS), so the way back asks the matching question instead.
        row.transformed = row.lost.filter(c => TRANSFORMS[c] && after.has(TRANSFORMS[c]));
        row.silent = row.lost.filter(c => !row.transformed.includes(c) && !said.includes(c.split('.').pop()));
        row.stage = !row.sim ? 'sim' : !re.ok ? 'recompile' : row.silent.length ? 'silent-loss' : (row.unsupported.length ? 'partial' : 'full');
        results.makecode.push(row);
        if (++n % 25 === 0) console.error(`  makecode ${n}/${programs.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
}

if (ONLY !== 'makecode') {
    for (const p of litePrograms().slice(0, LIMIT)) {
        const row = {id: p.id, device: p.device};
        let project;
        try { project = new SB3Creator().parse(p.src); } catch (e) { row.stage = 'parse'; row.detail = e.message.slice(0, 160); results.lite.push(row); continue; }
        let ex;
        try { ex = exportToMakeCode(project, {name: 'lite'}); } catch (e) { row.stage = 'export-threw'; row.detail = e.message.slice(0, 160); results.lite.push(row); continue; }
        row.exportUnsupported = ex.unsupported.map(String);
        const re = await pxtCompile(ex.ts);
        row.recompiles = re.ok;
        if (!re.ok) row.recompileError = re.error;
        row.stage = !re.ok ? 'recompile' : (row.exportUnsupported.length ? 'partial' : 'full');
        results.lite.push(row);
    }
}

// ── report ──────────────────────────────────────────────────────────────
const tally = rows => rows.reduce((m, r) => ((m[r.stage] = (m[r.stage] || 0) + 1), m), {});
const hist = (rows, key, norm) => {
    const m = {};
    for (const r of rows) for (const v of r[key] || []) { const k = norm(v); m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const normUnsupported = s => String(s).replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N').slice(0, 90);
const normError = s => String(s).replace(/'[^']*'/g, "'…'").replace(/\d+/g, 'N').slice(0, 90);
const table = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n');
const top = (entries, n = 25) => entries.slice(0, n).map(([k, v]) => `| ${v} | ${k.replace(/\|/g, '\\|')} |`).join('\n');

const mc = results.makecode;
const programs = mc.filter(r => !['needs-extension', 'not-a-program'].includes(r.stage));
const lines = [
    '# MakeCode round-trip census',
    '',
    `Generated by \`scripts/makecode-census.mjs\`${arg('--snippets') ? ' --snippets' : ''} on ${new Date().toISOString().slice(0, 10)} ` +
        `(${Math.round((Date.now() - t0) / 1000)} s). Stage definitions are in the script header. Do not edit by hand.`,
    ''
];
if (ONLY !== 'lite') {
    lines.push(
        `## MakeCode's own programs (pxt-microbit 9.1.1 docs) — ${mc.length} programs, ${programs.length} compile as MakeCode wrote them`,
        '',
        '| outcome | programs |', '|---|---|', table(tally(mc)), '',
        '`full` = imported with nothing unsupported, runs in our simulator, re-exported and recompiled by MakeCode, no call lost. ' +
        '`partial` = the same, with unsupported calls NAMED. `silent-loss` = a call vanished without being named.',
        '',
        '### What import names unsupported, most common first', '', '| programs | unsupported |', '|---|---|',
        top(hist(programs, 'unsupported', normUnsupported)), '',
        '### Calls lost SILENTLY (in neither the re-export nor any unsupported list)', '', '| programs | call |', '|---|---|',
        top(hist(programs, 'silent', s => s)), '',
        '### Calls transformed by design (event handler -> polling), not lost', '', '| programs | call |', '|---|---|',
        top(hist(programs, 'transformed', s => s)), '',
        '### Why a re-export does not recompile', '', '| programs | MakeCode error |', '|---|---|',
        top(hist(programs.filter(r => r.recompileError).map(r => ({e: [r.recompileError]})), 'e', normError)), '',
        '### Why a translation does not run in our simulator', '', '| programs | reason |', '|---|---|',
        top(hist(programs.filter(r => r.simReasons), 'simReasons', normError)), ''
    );
}
if (ONLY !== 'makecode') {
    const lite = results.lite;
    lines.push(
        `## lite's own pseudocode, retargeted to the micro:bit — ${lite.length} programs`, '',
        '| outcome | programs |', '|---|---|', table(tally(lite)), '',
        '### By original device', '', '| device | programs | full | partial | fail |', '|---|---|---|---|---|',
        ...Object.entries(lite.reduce((m, r) => ((m[r.device] = m[r.device] || []).push(r), m), {}))
            .sort((a, b) => b[1].length - a[1].length)
            .map(([d, rs]) => `| ${d} | ${rs.length} | ${rs.filter(r => r.stage === 'full').length} | ${rs.filter(r => r.stage === 'partial').length} | ${rs.filter(r => !['full', 'partial'].includes(r.stage)).length} |`),
        '',
        '### What the export names unsupported', '', '| programs | unsupported |', '|---|---|',
        top(hist(lite, 'exportUnsupported', normUnsupported)), '',
        '### Why an export does not compile', '', '| programs | MakeCode error |', '|---|---|',
        top(hist(lite.filter(r => r.recompileError).map(r => ({e: [r.recompileError]})), 'e', normError)), ''
    );
}
fs.mkdirSync(path.join(ROOT, 'test-results'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'test-results/makecode-census.json'), JSON.stringify(results, null, 1));
fs.writeFileSync(path.join(ROOT, 'docs/generated/MAKECODE-CENSUS.md'), lines.join('\n') + '\n');
console.log(lines.slice(0, 16).join('\n'));
