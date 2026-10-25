import React from 'react';

/**
 * The CPU-internals instrument for the RISC-V bench (E8, task C4): a classic
 * 5-stage pipeline diagram, the cycles-per-instruction breakdown, and the
 * cache and branch-predictor statistics of a program running in the debugger.
 *
 * WHAT IT SHOWS IS A MODEL, AND SAYS SO. bw-board's timing models
 * (uarch-pipeline.js, uarch-cache.js, uarch-predictor.js) read the stream of
 * instructions the functional core retires and charge cycles for them. They
 * never change what the program computes — the core stays the one Spike
 * checks — so turning this on changes the speed of the run, never its result.
 * The claim is agreement with the model's stated rules (hand-checked cycle
 * counts in bw-board's tests), not with any particular silicon.
 *
 * Data: the runner's `debugTiming(n)` → {config, stats, occupancy} from the
 * RISC-V debug target, read at render (the panel re-renders on every runner
 * snapshot, as the other instrument panes do). `setDebugTiming(cfg|null)`
 * turns the model on, off, or restarts it with a new configuration. Only a
 * target that offers timing shows this pane at all.
 *
 * Self-contained on purpose: it imports nothing but React, so the DOM test
 * (test/debug-pipeline-view.test.mjs) renders the real component against a
 * real bw-board target.
 */

export const L10N = {
    en: {
        title: 'CPU pipeline (timing model)',
        intro: 'A model of a classic 5-stage pipeline, fed by the instructions this RISC-V core retires. ' +
            'It counts clock cycles; it never changes what the program computes.',
        enable: 'Model the timing',
        off: 'Off: the core runs at full speed. Modelling the timing slows the run about tenfold.',
        forwarding: 'Forwarding',
        resolve: 'Branch decided in',
        predictor: 'Branch predictor',
        'predictor.static-nt': 'always "not taken"',
        'predictor.bimodal': 'bimodal (2-bit counters)',
        'predictor.gshare': 'gshare (global history)',
        btb: 'Branch target buffer',
        icache: 'Instruction cache',
        dcache: 'Data cache',
        'cache.off': 'none (every access 1 cycle)',
        'cache.small': '1 KiB, 2-way, 16-byte lines',
        'cache.large': '8 KiB, 4-way, 32-byte lines',
        replacement: 'Replacement',
        'replacement.lru': 'least recently used',
        'replacement.fifo': 'first in, first out',
        restartNote: 'Changing a setting starts a fresh model (cold caches) at the next instruction.',
        refused: 'The model refused this setting: {why}',
        diagram: 'Pipeline diagram, last {n} cycles',
        diagramHint: 'Rows are instructions, columns are clock cycles. F D X M W: fetch, decode, execute, ' +
            'memory, write-back. A lower-case letter is a cycle the instruction had to wait in that stage.',
        bubbles: 'WB empty',
        waiting: 'Run or step the program to fill the pipeline.',
        inflight: 'The newest instructions are still in flight: they count once they leave WB.',
        cycles: 'cycles', insts: 'instructions', cpi: 'CPI', ipc: 'IPC',
        breakdown: 'Where the cycles went (cycles per instruction)',
        'reason.base': 'doing work',
        'reason.fill': 'pipeline filling',
        'reason.loaduse': 'waiting for a loaded value',
        'reason.raw': 'waiting for a result (data dependency)',
        'reason.muldiv': 'multiplier / divider busy',
        'reason.icache': 'instruction-cache miss',
        'reason.dcache': 'data-cache miss',
        'reason.control': 'wrong branch guess or jump',
        'reason.trap': 'trap or interrupt',
        'reason.frozen': 'held by a stall further down',
        'reason.drain': 'pipeline draining',
        accesses: 'accesses', misses: 'misses', missRate: 'miss rate', writebacks: 'write-backs',
        predictions: 'predictions', accuracy: 'accuracy', btbHits: 'BTB hits',
        caches: 'Caches', branches: 'Branches'
    },
    de: {
        title: 'CPU-Pipeline (Zeitmodell)',
        intro: 'Ein Modell einer klassischen 5-stufigen Pipeline, gespeist mit den Befehlen, die dieser ' +
            'RISC-V-Kern ausführt. Es zählt Takte; was das Programm berechnet, ändert es nie.',
        enable: 'Zeitverhalten modellieren',
        off: 'Aus: der Kern läuft mit voller Geschwindigkeit. Das Modellieren verlangsamt den Lauf etwa um den Faktor zehn.',
        forwarding: 'Forwarding (Weiterleitung)',
        resolve: 'Sprung entschieden in',
        predictor: 'Sprungvorhersage',
        'predictor.static-nt': 'immer „nicht genommen“',
        'predictor.bimodal': 'bimodal (2-Bit-Zähler)',
        'predictor.gshare': 'gshare (globale Historie)',
        btb: 'Sprungzielpuffer (BTB)',
        icache: 'Befehlscache',
        dcache: 'Datencache',
        'cache.off': 'keiner (jeder Zugriff 1 Takt)',
        'cache.small': '1 KiB, 2-fach, 16-Byte-Zeilen',
        'cache.large': '8 KiB, 4-fach, 32-Byte-Zeilen',
        replacement: 'Ersetzung',
        'replacement.lru': 'am längsten unbenutzt (LRU)',
        'replacement.fifo': 'zuerst geladen (FIFO)',
        restartNote: 'Eine geänderte Einstellung startet ein neues Modell (kalte Caches) ab dem nächsten Befehl.',
        refused: 'Das Modell lehnt diese Einstellung ab: {why}',
        diagram: 'Pipeline-Diagramm, letzte {n} Takte',
        diagramHint: 'Zeilen sind Befehle, Spalten sind Takte. F D X M W: Holen, Dekodieren, Ausführen, ' +
            'Speicher, Zurückschreiben. Ein Kleinbuchstabe ist ein Takt, in dem der Befehl in dieser Stufe warten musste.',
        bubbles: 'WB leer',
        waiting: 'Programm laufen lassen oder schrittweise ausführen, um die Pipeline zu füllen.',
        inflight: 'Die neuesten Befehle sind noch unterwegs: sie zählen, sobald sie WB verlassen.',
        cycles: 'Takte', insts: 'Befehle', cpi: 'CPI', ipc: 'IPC',
        breakdown: 'Wohin die Takte gingen (Takte pro Befehl)',
        'reason.base': 'Arbeit',
        'reason.fill': 'Pipeline füllt sich',
        'reason.loaduse': 'Warten auf einen geladenen Wert',
        'reason.raw': 'Warten auf ein Ergebnis (Datenabhängigkeit)',
        'reason.muldiv': 'Multiplizierer / Dividierer belegt',
        'reason.icache': 'Befehlscache-Fehlzugriff',
        'reason.dcache': 'Datencache-Fehlzugriff',
        'reason.control': 'falsch vorhergesagter Sprung',
        'reason.trap': 'Trap oder Interrupt',
        'reason.frozen': 'von einem Halt weiter unten festgehalten',
        'reason.drain': 'Pipeline leert sich',
        accesses: 'Zugriffe', misses: 'Fehlzugriffe', missRate: 'Fehlrate', writebacks: 'Rückschreibungen',
        predictions: 'Vorhersagen', accuracy: 'Trefferquote', btbHits: 'BTB-Treffer',
        caches: 'Caches', branches: 'Sprünge'
    }
};

const tr = (locale, key, vars) => {
    const lang = String(locale || '').slice(0, 2).toLowerCase();
    const table = L10N[lang] || L10N.en;
    const s = table[key] || L10N.en[key] || key;
    return vars ? s.replace(/\{(\w+)\}/g, (w, k) => (k in vars ? String(vars[k]) : w)) : s;
};

export const STALL_KEYS = ['loaduse', 'raw', 'muldiv', 'icache', 'dcache', 'control', 'trap'];
export const REASON_COLOR = {
    base: '#2ecc71', fill: '#34495e', loaduse: '#e67e22', raw: '#e74c3c', muldiv: '#9b59b6',
    icache: '#3498db', dcache: '#1abc9c', control: '#f1c40f', trap: '#95a5a6', frozen: '#566573', drain: '#34495e'
};
const STAGE_LETTER = {IF: 'F', ID: 'D', EX: 'X', MEM: 'M', WB: 'W'};
const CACHE_PRESET = {
    off: null,
    small: {size: 1024, ways: 2, line: 16},
    large: {size: 8192, ways: 4, line: 32}
};
export const DEFAULT_SETTINGS = Object.freeze({
    forwarding: true, branchResolve: 'EX', predictor: 'bimodal', btb: true,
    icache: 'small', dcache: 'small', replacement: 'lru'
});
const DIAGRAM_CYCLES = 32;
const DIAGRAM_ROWS = 14;

/** The pane's settings → a bw-board PipelineModel config. */
export function pipelineConfig (s) {
    const cache = name => (CACHE_PRESET[s[name]] ? {...CACHE_PRESET[s[name]], replacement: s.replacement} : null);
    return {
        forwarding: !!s.forwarding,
        branchResolve: s.branchResolve === 'ID' ? 'ID' : 'EX',
        predictor: {kind: s.predictor},
        btb: s.btb ? {entries: 64} : null,
        icache: cache('icache'),
        dcache: cache('dcache'),
        missPenalty: 10,
        recordCycles: 64
    };
}

/**
 * The occupancy window as grid rows: one per instruction (newest last, at
 * most `maxRows`), each a cell per cycle: {letter, held, reason} or null.
 */
export function diagramRows (occupancy, maxRows = DIAGRAM_ROWS) {
    if (!occupancy || !occupancy.cycles) return {first: 0, cycles: 0, rows: [], wbBubbles: []};
    const first = occupancy.firstCycle, n = occupancy.cycles;
    const rows = occupancy.rows.slice(-maxRows).map(r => {
        const cells = new Array(n).fill(null);
        for (const c of r.cells) {
            const i = c.cycle - first;
            if (i >= 0 && i < n) cells[i] = {letter: STAGE_LETTER[c.stage], held: !!c.hold, reason: c.hold};
        }
        return {seq: r.seq, pc: r.pc, text: r.text || '?', cells};
    });
    const wbBubbles = new Array(n).fill(null);
    for (const b of occupancy.bubbles) if (b.stage === 'WB' && b.cycle - first >= 0 && b.cycle - first < n) wbBubbles[b.cycle - first] = b.reason;
    return {first, cycles: n, rows, wbBubbles};
}

/** CPI split into its parts, in the order the bar draws them. */
export function cpiParts (stats) {
    const insts = stats['cpu.insts'] || 0;
    if (!insts) return [];
    const parts = [{key: 'base', value: 1}, {key: 'fill', value: stats['pipe.fill'] / insts}];
    for (const k of STALL_KEYS) parts.push({key: k, value: (stats[`pipe.stall.${k}`] || 0) / insts});
    return parts.filter(p => p.value > 0);
}

const pct = v => `${(100 * v).toFixed(1)} %`;
const num = v => (Number.isFinite(v) ? v.toLocaleString('en-US') : '—');

const BOX = {border: '1px solid #2c3e50', borderRadius: 6, padding: 8, background: '#12121f', color: '#ecf0f1', fontSize: 12};
const LABEL = {color: '#7f8c8d', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6};
const CONTROL = {background: '#16213e', color: '#ecf0f1', border: '1px solid #2c3e50', borderRadius: 3, fontSize: 11, padding: '2px 4px'};
const CELL = {width: 14, minWidth: 14, height: 16, textAlign: 'center', fontFamily: 'monospace', fontSize: 11, lineHeight: '16px'};

class DebugPipeline extends React.Component {
    constructor (props) {
        super(props);
        this.state = {open: false, enabled: false, settings: {...DEFAULT_SETTINGS}, refused: null};
        this.toggleOpen = () => this.setState(s => ({open: !s.open}));
        this.onEnable = e => this.apply(e.target.checked, this.state.settings);
    }

    t (key, vars) { return tr(this.props.locale, key, vars); }

    supported () {
        const r = this.props.runner;
        return !!(r && typeof r.debugTimingSupported === 'function' && r.debugTimingSupported());
    }

    /** Turn the model on/off, or restart it with new settings. */
    apply (enabled, settings) {
        const r = this.props.runner;
        const res = r.setDebugTiming(enabled ? pipelineConfig(settings) : null);
        const refused = res && (res.refused || res.unsupported) ? String(res.refused || res.unsupported) : null;
        this.setState({enabled: enabled && !refused, settings, refused});
    }

    change (key, value) {
        const settings = {...this.state.settings, [key]: value};
        if (this.state.enabled) this.apply(true, settings); else this.setState({settings});
    }

    componentDidUpdate () {
        // A new program builds a new target, which starts with timing off:
        // carry the user's choice over rather than silently showing "off".
        if (this.state.enabled && this.supported() && this.props.runner.debugTiming(1) === null) {
            this.apply(true, this.state.settings);
        }
    }

    renderControls () {
        const s = this.state.settings;
        const select = (key, options, label) => (
            <label style={{display: 'flex', gap: 4, alignItems: 'center'}}>
                <span>{label}</span>
                <select data-debug-pipeline-setting={key} value={String(s[key])} style={CONTROL}
                    onChange={e => this.change(key, e.target.value)}>
                    {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
                </select>
            </label>
        );
        const check = (key, label) => (
            <label style={{display: 'flex', gap: 4, alignItems: 'center'}}>
                <input type="checkbox" data-debug-pipeline-setting={key} checked={!!s[key]}
                    onChange={e => this.change(key, e.target.checked)} />
                <span>{label}</span>
            </label>
        );
        const caches = ['off', 'small', 'large'].map(v => [v, this.t(`cache.${v}`)]);
        return (
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px 12px', margin: '6px 0'}}>
                {check('forwarding', this.t('forwarding'))}
                {select('branchResolve', [['EX', 'EX'], ['ID', 'ID']], this.t('resolve'))}
                {select('predictor', ['static-nt', 'bimodal', 'gshare'].map(v => [v, this.t(`predictor.${v}`)]), this.t('predictor'))}
                {check('btb', this.t('btb'))}
                {select('icache', caches, this.t('icache'))}
                {select('dcache', caches, this.t('dcache'))}
                {select('replacement', ['lru', 'fifo'].map(v => [v, this.t(`replacement.${v}`)]), this.t('replacement'))}
            </div>
        );
    }

    renderDiagram (occupancy) {
        const d = diagramRows(occupancy);
        if (!d.rows.length) return <div data-debug-pipeline-empty style={{color: '#7f8c8d'}}>{this.t('waiting')}</div>;
        const cyc = [];
        for (let i = 0; i < d.cycles; i++) cyc.push(d.first + i);
        return (
            <div>
                <div style={LABEL}>{this.t('diagram', {n: d.cycles})}</div>
                <div style={{overflowX: 'auto'}}>
                    <table data-debug-pipeline-diagram style={{borderCollapse: 'collapse'}}>
                        <thead>
                            <tr>
                                <th />
                                {cyc.map(c => (
                                    <th key={c} style={{...CELL, color: '#566573', fontWeight: 'normal', fontSize: 9}}>
                                        {c % 5 === 0 ? c : ''}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {d.rows.map(r => (
                                <tr key={r.seq} data-debug-pipeline-row={r.seq}>
                                    <td data-debug-pipeline-insn style={{fontFamily: 'monospace', fontSize: 11, paddingRight: 8, whiteSpace: 'nowrap'}}>
                                        {r.text}
                                    </td>
                                    {r.cells.map((c, i) => (
                                        <td key={i} data-debug-pipeline-cell={c ? (c.held ? c.letter.toLowerCase() : c.letter) : '.'}
                                            title={c && c.held ? this.t(`reason.${c.reason}`) : undefined}
                                            style={{...CELL,
                                                color: c ? (c.held ? '#12121f' : '#ecf0f1') : '#2c3e50',
                                                background: c && c.held ? (REASON_COLOR[c.reason] || '#566573') : 'transparent'}}>
                                            {c ? (c.held ? c.letter.toLowerCase() : c.letter) : '·'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            <tr data-debug-pipeline-bubbles>
                                <td style={{...LABEL, paddingRight: 8}}>{this.t('bubbles')}</td>
                                {d.wbBubbles.map((b, i) => (
                                    <td key={i} data-debug-pipeline-bubble={b || ''}
                                        title={b ? this.t(`reason.${b}`) : undefined}
                                        style={{...CELL, background: b ? (REASON_COLOR[b] || '#34495e') : 'transparent'}} />
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div style={{color: '#7f8c8d', fontSize: 10, marginTop: 4}}>{this.t('diagramHint')}</div>
            </div>
        );
    }

    renderStats (stats) {
        const parts = cpiParts(stats);
        const total = parts.reduce((a, p) => a + p.value, 0) || 1;
        const cache = name => (stats[`${name}.accesses`] === undefined ? null : (
            <div data-debug-pipeline-cache={name} data-debug-pipeline-miss-rate={stats[`${name}.missRate`]}>
                <strong>{this.t(name)}</strong>{': '}
                {num(stats[`${name}.accesses`])} {this.t('accesses')}{', '}
                {num(stats[`${name}.misses`])} {this.t('misses')}{' ('}{pct(stats[`${name}.missRate`])}{')'}
                {name === 'dcache' ? `, ${num(stats['dcache.writebacks'])} ${this.t('writebacks')}` : ''}
            </div>
        ));
        return (
            <div style={{display: 'grid', gap: 6, marginTop: 8}}>
                <div data-debug-pipeline-cycles={stats['cpu.cycles']} data-debug-pipeline-insts={stats['cpu.insts']}
                    data-debug-pipeline-cpi={stats['cpu.cpi']}
                    style={{display: 'flex', gap: 14, flexWrap: 'wrap', fontFamily: 'monospace'}}>
                    <span>{num(stats['cpu.cycles'])} {this.t('cycles')}</span>
                    <span>{num(stats['cpu.insts'])} {this.t('insts')}</span>
                    <span>{this.t('cpi')} {stats['cpu.insts'] ? stats['cpu.cpi'].toFixed(2) : '—'}</span>
                    <span>{this.t('ipc')} {stats['cpu.insts'] ? stats['cpu.ipc'].toFixed(2) : '—'}</span>
                </div>
                {parts.length ? (
                    <div>
                        <div style={LABEL}>{this.t('breakdown')}</div>
                        <div data-debug-pipeline-cpi-bar style={{display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', margin: '3px 0'}}>
                            {parts.map(p => (
                                <div key={p.key} title={this.t(`reason.${p.key}`)}
                                    style={{width: `${(100 * p.value) / total}%`, background: REASON_COLOR[p.key]}} />
                            ))}
                        </div>
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 11}}>
                            {parts.map(p => (
                                <span key={p.key} data-debug-pipeline-stall={p.key} data-debug-pipeline-stall-cpi={p.value}>
                                    <span style={{display: 'inline-block', width: 8, height: 8, marginRight: 3, background: REASON_COLOR[p.key]}} />
                                    {this.t(`reason.${p.key}`)}{' '}{p.value.toFixed(2)}
                                </span>
                            ))}
                        </div>
                    </div>
                ) : null}
                <div>
                    <div style={LABEL}>{this.t('caches')}</div>
                    {cache('icache')}
                    {cache('dcache')}
                </div>
                <div data-debug-pipeline-predictor={stats['bp.kind']} data-debug-pipeline-accuracy={stats['bp.accuracy']}>
                    <div style={LABEL}>{this.t('branches')}</div>
                    {this.t(`predictor.${stats['bp.kind']}`)}{': '}
                    {num(stats['bp.predictions'])} {this.t('predictions')}{', '}
                    {this.t('accuracy')} {stats['bp.predictions'] ? pct(stats['bp.accuracy']) : '—'}
                    {stats['btb.lookups'] !== undefined ? `, ${this.t('btbHits')} ${stats['btb.lookups'] ? pct(stats['btb.hitRate']) : '—'}` : ''}
                </div>
            </div>
        );
    }

    render () {
        if (!this.supported()) return null;
        const view = this.state.open && this.state.enabled ? this.props.runner.debugTiming(DIAGRAM_CYCLES) : null;
        return (
            <section data-debug-pipeline data-debug-pipeline-state={this.state.enabled ? 'on' : 'off'} style={BOX}>
                <button type="button" data-debug-pipeline-toggle onClick={this.toggleOpen}
                    style={{...CONTROL, background: 'transparent', border: 'none', fontWeight: 600, padding: 0}}>
                    {this.state.open ? '▾ ' : '▸ '}{this.t('title')}
                </button>
                {this.state.open ? (
                    <div>
                        <div style={{color: '#bdc3c7', fontSize: 11, margin: '4px 0'}}>{this.t('intro')}</div>
                        <label style={{display: 'flex', gap: 4, alignItems: 'center'}}>
                            <input type="checkbox" data-debug-pipeline-enable checked={this.state.enabled} onChange={this.onEnable} />
                            <strong>{this.t('enable')}</strong>
                        </label>
                        {this.renderControls()}
                        {this.state.refused ? (
                            <div data-debug-pipeline-refused style={{color: '#e67e22'}}>{this.t('refused', {why: this.state.refused})}</div>
                        ) : null}
                        {this.state.enabled ? (
                            <div>
                                <div style={{color: '#7f8c8d', fontSize: 10}}>{this.t('restartNote')}</div>
                                {view ? this.renderDiagram(view.occupancy) : null}
                                {view && view.stats['cpu.insts'] ? this.renderStats(view.stats) : null}
                                {view && view.occupancy.rows.length ? (
                                    <div style={{color: '#7f8c8d', fontSize: 10}}>{this.t('inflight')}</div>
                                ) : null}
                            </div>
                        ) : (
                            <div style={{color: '#7f8c8d', fontSize: 11}}>{this.t('off')}</div>
                        )}
                    </div>
                ) : null}
            </section>
        );
    }
}

export default DebugPipeline;
