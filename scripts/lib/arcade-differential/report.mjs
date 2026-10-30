// Anonymous aggregation. Everything in `summarize` is a count or a cause category;
// nothing derived from program text, names or hashes (error text is normalized first).
import {CLASSES} from './analyze.mjs';

function causeOf(script) {
    if (script.class === 'diverges') {
        const c = script.constantEntropy;
        // Cause under constant entropy when it still diverges; if constant entropy agrees, the draws differed.
        if (c && (c.class === 'identical' || c.class === 'same-states-different-timing')) return 'random-draw-order-or-count';
        return (c?.class === 'diverges' && c.primaryCause) || script.primaryCause;
    }
    if (script.class === 'brickwright-error') return `brickwright-error:${script.reason}:${script.cause || ''}`;
    if (script.class === 'original-error') return `original-error:${script.reason}:${script.cause || ''}`;
    if (script.class === 'not-comparable') return `not-comparable:${script.reason}`;
    if (script.class === 'timeout') return `timeout:${script.side}`;
    return null;
}

export function summarize(rows, meta = {}) {
    const programs = Object.fromEntries(CLASSES.map(c => [c, 0]));
    const perScript = {};
    const causes = new Map();
    const entropyProbe = {};
    for (const row of rows) {
        programs[row.class]++;
        const seen = new Set();
        for (const [name, script] of Object.entries(row.scripts)) {
            perScript[name] ??= Object.fromEntries(CLASSES.map(c => [c, 0]));
            perScript[name][script.class]++;
            if (script.constantEntropy) entropyProbe[script.constantEntropy.class] = (entropyProbe[script.constantEntropy.class] || 0) + 1;
            const cause = causeOf(script);
            if (cause) {
                const entry = causes.get(cause) || {cause, programs: 0, scriptRuns: 0, class: script.class};
                entry.scriptRuns++; if (!seen.has(cause)) { entry.programs++; seen.add(cause); }
                causes.set(cause, entry);
            }
            if (script.translatorUnsupported) {
                const entry = causes.get('translator-reported-unsupported') || {cause: 'translator-reported-unsupported', programs: 0, scriptRuns: 0, class: 'diverges'};
                entry.scriptRuns++; if (!seen.has('tu')) { entry.programs++; seen.add('tu'); }
                causes.set('translator-reported-unsupported', entry);
            }
        }
    }
    const ranked = [...causes.values()].sort((a, b) => b.programs - a.programs || b.scriptRuns - a.scriptRuns || a.cause.localeCompare(b.cause));
    return {total: rows.length, programs, perScript, entropyProbe, causes: ranked, meta};
}

export function renderMarkdown(summary) {
    const {total, programs, perScript, causes, meta, entropyProbe} = summary;
    const lines = ['# Arcade behavioural differential', '', `Programs compared: **${total}**`, ''];
    if (meta.settings) lines.push(`Settings: ${Object.entries(meta.settings).map(([k, v]) => `${k}=${v}`).join(', ')}`, '');
    if (meta.paused) lines.push(`**Run paused:** ${meta.paused}`, '');
    lines.push('## Per program (worst input script)', '', '| class | programs |', '|---|---:|', ...CLASSES.map(c => `| ${c} | ${programs[c]} |`), '');
    lines.push('## Per input script', '', `| script | ${CLASSES.join(' | ')} |`, `|---|${CLASSES.map(() => '---:').join('|')}|`);
    for (const [name, counts] of Object.entries(perScript)) lines.push(`| ${name} | ${CLASSES.map(c => counts[c]).join(' | ')} |`);
    if (Object.keys(entropyProbe || {}).length) lines.push('', '## Constant-entropy re-run of diverging scripts', '', 'Outcome of re-running each diverging script with every random draw fixed (identical or timing-only means the difference was the order/number of draws).', '', '| outcome | script runs |', '|---|--:|', ...Object.entries(entropyProbe).map(([k, v]) => `| ${k} | ${v} |`));
    lines.push('', '## Ranked divergence causes', '', 'Cause = what differs first at the first divergent sample (or the error bucket). Programs may appear under several causes (one per input script).', '',
        '| # | cause | class | programs | script runs |', '|--:|---|---|--:|--:|');
    causes.forEach((c, i) => lines.push(`| ${i + 1} | ${c.cause.replace(/\|/g, '\\|')} | ${c.class} | ${c.programs} | ${c.scriptRuns} |`));
    return lines.join('\n') + '\n';
}
