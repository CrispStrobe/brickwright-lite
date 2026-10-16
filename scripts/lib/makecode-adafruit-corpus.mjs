/** Pinned CPX documentation inputs and independent source-call/block census. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CACHE_DIR, TARBALLS, untar} from '../sync-makecode-runtime.mjs';
import SB3Creator from '../../overlay/scratch-gui/src/lib/sb3-creator.js';
import {adafruitToPseudocode} from '../../overlay/scratch-gui/src/lib/bw-makecode/adafruit-translate.js';

export function adafruitPrograms (archive = path.join(CACHE_DIR, 'pxt-adafruit-1.6.8.tgz')) {
    const bytes = fs.readFileSync(archive);
    if (createHash('sha256').update(bytes).digest('hex') !== TARBALLS['pxt-adafruit@1.6.8'].sha256) {
        throw new Error('CPX documentation archive does not match the pinned pxt-adafruit source');
    }
    const rows = [];
    for (const [name, body] of [...untar(bytes)].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (!name.startsWith('docs/') || !name.endsWith('.md')) continue;
        let index = 0;
        for (const match of body.toString('utf8').matchAll(/```(blocks|typescript|block)\n([\s\S]*?)```/g)) {
            rows.push({id: `${name.slice(5, -3)}#${index++}`, fence: match[1], ts: match[2]});
        }
    }
    return rows;
}

// This reader checks source calls against the actual parsed blocks, rather
// than trusting a translator's own claim that a call was visited.
export function adafruitCalls (source) {
    // Walk nested template expressions structurally. A first-closing-brace
    // regex can lose calls after an object literal or nested template.
    const chars = source.split('').map(c => c === '\n' ? '\n' : ' ');
    let i = 0;
    const quoted = quote => {
        i++;
        while (i < source.length) {
            if (source[i] === '\\') { i += 2; continue; }
            if (source[i++] === quote) return;
        }
    };
    const template = () => {
        i++;
        while (i < source.length) {
            if (source[i] === '\\') { i += 2; continue; }
            if (source[i] === '`') { i++; return; }
            if (source[i] === '$' && source[i + 1] === '{') {
                i += 2;
                executable(true);
            } else i++;
        }
    };
    const executable = expression => {
        let depth = 0;
        while (i < source.length) {
            const c = source[i];
            if (c === '"' || c === "'") { quoted(c); continue; }
            if (c === '`') { template(); continue; }
            if (source.startsWith('//', i)) {
                while (i < source.length && source[i] !== '\n') i++;
                continue;
            }
            if (source.startsWith('/*', i)) {
                i += 2;
                while (i < source.length && !source.startsWith('*/', i)) i++;
                i += 2;
                continue;
            }
            if (c === '{') depth++;
            if (c === '}') {
                if (expression && depth === 0) { i++; return; }
                depth--;
            }
            chars[i] = c;
            i++;
        }
    };
    executable(false);
    const text = chars.join('');
    const namespaces = new Set(['light', 'input', 'music', 'pins', 'network', 'keyboard', 'mouse', 'gamepad',
        'storage', 'datalogger', 'settings', 'servos', 'control', 'loops', 'Math']);
    const calls = new Set();
    for (const m of text.matchAll(/\b([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)\s*\(/g)) {
        if (namespaces.has(m[1].split('.')[0])) calls.add(m[1]);
    }
    for (const m of text.matchAll(/(^|[^.\w])(pause|forever|randint)\s*\(/g)) calls.add(m[2]);
    return [...calls].sort();
}

const CPX_OP = {
    'light.setAll': ['setall'], 'light.setBrightness': ['setbrightness'], 'light.setPixelColor': ['setpixel'],
    'light.setGradient': ['setgradient'], 'light.graph': ['graph'], 'light.showRing': ['showring'],
    'light.clear': ['clearpixels'], 'light.showAnimation': ['showanimation'],
    'light.showAnimationFrame': ['showanimationframe'], 'light.stopAllAnimations': ['stopanimations'],
    'light.pixelColor': ['pixelcolor'], 'light.rgb': ['rgb'], 'light.hsv': ['hsv'], 'light.fade': ['fade'],
    'light._animationPicker': ['showanimation', 'showanimationframe'],
    'input.onGesture': ['whengesture'], 'input.onSwitchMoved': ['whenswitch'],
    'input.switchRight': ['isswitchright'], 'input.lightLevel': ['lightlevel'],
    'input.onLightConditionChanged': ['whenlight'], 'input.setLightThreshold': ['setlightthreshold'],
    'input.temperature': ['temperature'], 'input.onTemperatureConditionChanged': ['whentemperature'],
    'input.soundLevel': ['soundlevel'], 'input.onLoudSound': ['whenloudsound'],
    'input.setLoudSoundThreshold': ['setloudthreshold'], 'input.acceleration': ['acceleration'], 'input.rotation': ['rotation'],
    'music.playTone': ['playtone'], 'music.ringTone': ['ringtone'], 'music.rest': ['rest'],
    'music.beat': ['beat'], 'music.tempo': ['tempo'], 'music.setTempo': ['settempo'],
    'music.changeTempoBy': ['changetempo'], 'music.setVolume': ['setvolume'],
    'music.sounds': ['playsound', 'playsounduntildone'], 'music.playSound': ['playsound'],
    'music.playSoundUntilDone': ['playsounduntildone'], 'music.stopAllSounds': ['stopsounds']
};

function represented (name, ops) {
    if (CPX_OP[name]) return CPX_OP[name].some(op => ops.has(`circuitplayground_${op}`));
    const sound = /^music\.(powerUp|powerDown|jumpUp|jumpDown|baDing|wawawawaa|magicWand|siren|pewPew)\.(play|playUntilDone)$/.exec(name);
    if (sound) return ops.has(`circuitplayground_${sound[2] === 'play' ? 'playsound' : 'playsounduntildone'}`);
    if (/^input\.(buttonA|buttonB|buttonsAB)\.onEvent$/.test(name)) return ops.has('circuitplayground_whenbutton');
    if (/^input\.(buttonA|buttonB|buttonsAB)\.isPressed$/.test(name)) return ops.has('circuitplayground_isbuttonpressed');
    if (/^input\.(buttonA|buttonB|buttonsAB)\.wasPressed$/.test(name)) return ops.has('circuitplayground_wasbuttonpressed');
    if (/^input\.pinA[1-7]\.onEvent$/.test(name)) return ops.has('circuitplayground_whentouch');
    if (/^input\.pinA[1-7]\.isPressed$/.test(name)) return ops.has('circuitplayground_istouchpressed');
    if (['pause', 'loops.pause'].includes(name)) return ops.has('control_wait');
    if (['forever', 'loops.forever'].includes(name)) return ops.has('control_forever');
    if (['randint', 'Math.random', 'Math.randomRange'].includes(name)) return ops.has('operator_random');
    if (name === 'control.millis') return ops.has('sensing_timer');
    // These target selectors return their argument unchanged. The importer
    // still names an unsupported argument, and behavioural controls bind it.
    if (['light.colors', 'music.noteFrequency'].includes(name)) return true;
    const math = {abs: 'mathop', floor: 'mathop', ceil: 'mathop', sqrt: 'mathop', round: 'round',
        cos: 'mathop', sin: 'mathop', tan: 'mathop', atan: 'mathop', asin: 'mathop', acos: 'mathop',
        log: 'mathop', log10: 'mathop', exp: 'mathop', pow: 'mathop', min: 'mathop', max: 'mathop'};
    return name.startsWith('Math.') && math[name.slice(5)] && ops.has(`operator_${math[name.slice(5)]}`);
}

export function inspectAdafruitProgram (program) {
    const row = {id: program.id, calls: adafruitCalls(program.ts), unsupported: [], silent: []};
    const translated = adafruitToPseudocode(program.ts, {name: program.id});
    row.unsupported = translated.unsupported;
    const creator = new SB3Creator();
    const project = creator.parse(translated.code);
    const blocks = Object.values(project.targets[0].blocks);
    const ops = new Set(blocks.map(b => b.opcode));
    row.cpxBlocks = blocks.filter(b => b.opcode.startsWith('circuitplayground_')).length;
    row.silent = row.calls.filter(name => !represented(name, ops) &&
        !row.unsupported.some(reason => reason.includes(`${name}()`)));
    row.warnings = creator.warnings;
    row.stage = row.silent.length ? 'silent-loss' : creator.warnings.length ? 'parse' :
        row.unsupported.length ? (row.cpxBlocks ? 'partial' : 'refused-by-name') : 'full';
    return row;
}

export async function adafruitCensus ({archive, compile = null, match = null, limit = Infinity} = {}) {
    const inputs = adafruitPrograms(archive).filter(p => !match || match.test(p.id)).slice(0, limit);
    const rows = [];
    for (const program of inputs) {
        try {
            if (compile) {
                try { await compile(program.ts); } catch (error) {
                    // Missing compiler inputs or a broken compiler are not
                    // evidence that the original documentation is invalid.
                    if (!String(error.message || error).startsWith('MakeCode does not compile it: ')) throw error;
                    rows.push({id: program.id, stage: 'not-a-program', detail: String(error.message || error),
                        calls: adafruitCalls(program.ts), silent: [], unsupported: []});
                    continue;
                }
            }
            rows.push(inspectAdafruitProgram(program));
        } catch (error) {
            rows.push({id: program.id, stage: 'import-or-parse-error', detail: String(error.message || error),
                calls: adafruitCalls(program.ts), silent: [], unsupported: []});
        }
    }
    return {target: 'pxt-adafruit@1.6.8', originalCompilerChecked: Boolean(compile),
        total: rows.length, tally: rows.reduce((a, r) => { a[r.stage] = (a[r.stage] || 0) + 1; return a; }, {}), rows};
}

export function adafruitCensusMarkdown (result) {
    const safe = s => String(s).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
    return ['## Circuit Playground Express import census (pxt-adafruit 1.6.8)', '',
        `All ${result.total} documentation code fences (blocks, typescript and block), without deduplication.`,
        'The earlier 149-program estimate is superseded by this exhaustive source count.',
        'These are import outcomes; full-program behavioural equivalence and CPX re-export are separate.',
        `Original target compiler checked: ${result.originalCompilerChecked ? 'yes' : 'no (static preview only)'}.`, '',
        '| outcome | programs |', '|---|---|',
        ...Object.entries(result.tally).sort().map(([k, v]) => `| ${k} | ${v} |`), '',
        '`full` means translated and parsed without warnings or unnamed source-call loss; `partial` retains named refusals.',
        '`refused-by-name` has named refusals and no translated CPX block. Original compiler failures remain `not-a-program`.',
        'The source-call reader compares actual parsed opcodes with source calls; an unnamed missing call is `silent-loss`.',
        'CPX MakeCode re-export is refused by name. Downloading the original recovered source remains available.', '',
        '| program | outcome | named refusals / errors | unnamed missing calls |', '|---|---|---|---|',
        ...result.rows.map(r => `| ${safe(r.id)} | ${r.stage} | ${safe(r.detail || r.unsupported.join('; ') ||
            (r.warnings || []).join('; ') || '—')} | ${safe(r.silent.join(', ') || '—')} |`), ''].join('\n');
}
