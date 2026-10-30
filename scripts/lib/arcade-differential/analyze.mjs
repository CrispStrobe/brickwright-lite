// One program: run both sides under the watchdog and classify each input script.
import {runJob} from './watchdog.mjs';
import {compareRecordings, frameHash} from './compare.mjs';
import {SCRIPT_NAMES} from './script.mjs';

export const CLASSES = ['identical', 'same-states-different-timing', 'diverges', 'brickwright-error', 'original-error', 'not-comparable', 'timeout'];
// Worst-first: the class a program is reported under when its scripts disagree.
const SEVERITY = ['timeout', 'brickwright-error', 'original-error', 'diverges', 'not-comparable', 'same-states-different-timing', 'identical'];

/** Top-level `let/const/var NAME` declarations: the named globals worth reading on both sides. */
export function topLevelNames(source) {
    const names = [];
    for (const m of source.matchAll(/^(?:let|const|var)\s+([A-Za-z_$][\w$]*)/gm)) if (!names.includes(m[1])) names.push(m[1]);
    return names.slice(0, 40);
}

/** Strip anything program-specific from an error so it can be counted across programs. */
export function normalizeError(message) {
    return String(message || '').split('\n')[0]
        .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '"…"').replace(/\b0x[0-9a-f]+\b/gi, 'N').replace(/\d+(\.\d+)?/g, 'N')
        .replace(/\b[a-z_$][\w$]*___N\b/gi, 'ID').replace(/\s+/g, ' ').trim().slice(0, 110);
}

const MISSING_ASSET = /assets\.|tilemap`|tileset|jres|Cannot find name '(?:assets|tiles)'|Could not find (?:extension|package)/i;

export function classifyScript(orig, bw) {
    if (!orig) return {class: 'timeout', side: 'original'};
    if (!bw) return {class: 'timeout', side: 'brickwright'};
    if (orig.status === 'compile-error') {
        const text = (orig.diagnostics || []).join(' ');
        return MISSING_ASSET.test(text) ? {class: 'not-comparable', reason: 'needs-artwork-or-package-outside-snippet'}
            : {class: 'original-error', reason: 'compile', cause: normalizeError(text)};
    }
    if (orig.status !== 'ok') return {class: 'original-error', reason: 'runtime', cause: normalizeError(orig.error)};
    if (!orig.samples.length || orig.samples.every(s => s.frame === null)) return {class: 'not-comparable', reason: 'original-produced-no-display'};
    if (bw.status !== 'ok') return {class: 'brickwright-error', reason: bw.status, cause: normalizeError(bw.error),
        atSample: bw.samples.length, unsupported: bw.unsupported?.length || 0};
    const result = compareRecordings(orig, bw);
    if (result.class === 'diverges' && bw.unsupported?.length) result.translatorUnsupported = bw.unsupported.length;
    return result;
}

export function rollup(scripts) {
    const classes = Object.values(scripts).map(s => s.class);
    return SEVERITY.find(c => classes.includes(c));
}

/** First-divergence full frames, for the private report only. */
export function divergenceFrames(orig, bw, scriptResult) {
    const k = scriptResult.firstDifference?.k;
    if (k === undefined) return null;
    const frame = (rec, sample) => { const f = sample?.frame == null ? null : rec.frames[sample.frame]; return f && {pix: f.pix, palette: f.palette, hash: frameHash(f)}; };
    return {k, original: frame(orig, orig.samples[k]), brickwright: frame(bw, bw.samples[k]),
        originalSprites: orig.samples[k]?.sprites, brickwrightSprites: bw.samples[k]?.sprites};
}

/**
 * Analyze one program source. Returns {class, scripts:{name:{...}}, timings}.
 * `opts.brickwrightSource` runs a different program on the Brickwright side (tests use it to plant a known divergence).
 * `opts`: seconds, fps, seed, entropy, scripts, timeoutMs {original, brickwright}, workDir, keepFrames.
 */
export async function analyzeProgram(source, opts) {
    const scripts = opts.scripts || SCRIPT_NAMES;
    const base = {source, scripts, seconds: opts.seconds, fps: opts.fps ?? 30, seed: opts.seed ?? 1, entropy: opts.entropy || 'sequence', globalsOf: topLevelNames(source)};
    const t0 = Date.now();
    const sides = {};
    for (const side of ['original', 'brickwright']) {
        const started = Date.now();
        const job = await runJob({...base, side, source: side === 'brickwright' && opts.brickwrightSource !== undefined ? opts.brickwrightSource : source}, {timeoutMs: opts.timeoutMs[side], workDir: opts.workDir, childScript: opts.childScript});
        sides[side] = {job, results: Object.fromEntries(job.lines.map(l => [l.script, l.result])), ms: Date.now() - started};
    }
    const out = {}, frames = {}, probes = [];
    for (const name of scripts) {
        const o = sides.original.results[name], b = sides.brickwright.results[name];
        let result = classifyScript(o, b);
        if (result.class === 'timeout' && !(o && b)) {
            const side = !o ? 'original' : 'brickwright', job = sides[side].job;
            // A crash (no result, no timeout) is an error of that side, not a hang.
            if (job.status === 'crashed') result = {class: side === 'original' ? 'original-error' : 'brickwright-error', reason: 'child-crashed', cause: normalizeError(job.stderr)};
            else result.limitMs = opts.timeoutMs[side];
        }
        out[name] = result;
        if (result.class === 'diverges' && opts.entropyProbe === true && base.entropy !== 'constant') probes.push(name);
        if (result.class === 'diverges' && opts.keepFrames !== false) frames[name] = divergenceFrames(o, b, result);
    }
    // Diverged scripts are re-run with constant entropy on both sides. If that run agrees, the
    // difference was the order/number of random draws, not what the program does with them.
    if (probes.length) {
        const probe = await analyzeProgram(source, {...opts, scripts: probes, entropy: 'constant', entropyProbe: false, keepFrames: false});
        for (const name of probes) {
            const c = probe.scripts[name];
            out[name].constantEntropy = c.class === 'diverges' ? {class: c.class, primaryCause: c.primaryCause} : {class: c.class};
        }
    }
    return {class: rollup(out), scripts: out, frames, ms: Date.now() - t0,
        sideMs: {original: sides.original.ms, brickwright: sides.brickwright.ms}};
}
