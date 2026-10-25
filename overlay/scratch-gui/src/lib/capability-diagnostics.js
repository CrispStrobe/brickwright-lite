/**
 * What the extension capability broker has been asked for, and what it decided.
 *
 * CP3-D2's requirement: render DECLARED, ALLOWED, REFUSED and REVOKED capability state from
 * bounded, redacted audit data — and show no pin source, digest, lease, correlation, raw
 * arguments, raw results or dependency errors.
 *
 * There are TWO sources and a panel showing one tells half the story:
 *
 *   the WORKER path   `capabilityBroker.diagnostics()` in the VM. Bounded at 256 entries and
 *                     already redacted at the point of RECORDING: the entry type has no field
 *                     for a digest, a URL, arguments or a result. This is the only source that
 *                     knows what an extension DECLARED, and it works in the browser.
 *   the NATIVE path   `native_broker_audit` in the desktop app. Structurally redacted the same
 *                     way. Reads only under Tauri, and only from the main webview; in a browser
 *                     the command does not exist and this section says so rather than appearing
 *                     empty, because "no native activity" and "no native boundary" are different
 *                     facts and a panel that conflates them is a worse diagnostic than none.
 *
 * Redaction here is a WHITELIST, not a filter. `row()` names the fields it will render and
 * copies nothing else, so a future field added to either source cannot reach this panel by
 * default — it has to be added here, deliberately, which is a review. A blocklist would leak
 * the first field nobody thought about.
 *
 * Deliberately plain DOM with inline styles and no imports, in the idiom of ble-diagnostics.js:
 * a diagnostic has to keep working when the thing being diagnosed is the GUI.
 */

/** Every field this panel will ever render, per source. Nothing else is copied. */
export const NATIVE_FIELDS = Object.freeze(
    ['index', 'at', 'principal', 'operation', 'resource', 'sequence', 'decision', 'denial']);
export const WORKER_FIELDS = Object.freeze(
    ['seq', 'time', 'event', 'workerId', 'slug', 'declared', 'operation', 'code']);

const scalar = value => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(scalar).join(' ');
    if (typeof value === 'object') return '';   // no object survives to the DOM
    return String(value);
};

/** Copy exactly the named fields. The whitelist is the redaction. */
export const row = (source, fields) => {
    const out = {};
    for (const field of fields) out[field] = scalar(source ? source[field] : undefined);
    return Object.freeze(out);
};

export const nativeRows = rows => (Array.isArray(rows) ? rows : []).map(r => row(r, NATIVE_FIELDS));
export const workerRows = rows => (Array.isArray(rows) ? rows : []).map(r => row(r, WORKER_FIELDS));

/**
 * The four states CP3-D2 names, counted across both sources, so the summary line answers the
 * question the panel exists to answer without anyone reading the table.
 */
export const summarise = (native, worker) => {
    const counts = {declared: 0, allowed: 0, refused: 0, revoked: 0};
    for (const r of native) {
        if (r.decision === 'allowed') counts.allowed++;
        else if (r.decision === 'revoked') counts.revoked++;
        else if (r.decision === 'denied') counts.refused++;
    }
    for (const r of worker) {
        if (r.declared) counts.declared += String(r.declared).split(' ').filter(Boolean).length;
        if (r.event === 'allowed') counts.allowed++;
        else if (r.event === 'refused') counts.refused++;
        else if (r.event === 'revoked') counts.revoked++;
    }
    return counts;
};

export const asText = (native, worker, nativeNote) => {
    const table = (title, fields, rows, note) => {
        const head = `${title} (${rows.length})`;
        if (note) return `${head}\n  ${note}`;
        if (!rows.length) return `${head}\n  (nothing recorded)`;
        return [head, `  ${fields.join('  ')}`]
            .concat(rows.map(r => `  ${fields.map(f => r[f]).join('  ')}`)).join('\n');
    };
    const counts = summarise(native, worker);
    return [
        `declared ${counts.declared}   allowed ${counts.allowed}   ` +
            `refused ${counts.refused}   revoked ${counts.revoked}`,
        '',
        table('native boundary', NATIVE_FIELDS, native, nativeNote),
        '',
        table('extension workers', WORKER_FIELDS, worker, null)
    ].join('\n');
};

/**
 * Read both sources. Never throws: a diagnostics panel that fails to open because one of its
 * inputs is unavailable is the failure it exists to report.
 */
export const collect = async ({invoke, workerDiagnostics} = {}) => {
    let native = [];
    let nativeNote = null;
    if (typeof invoke === 'function') {
        try {
            native = nativeRows(await invoke('native_broker_audit'));
        } catch (error) {
            nativeNote = `unavailable: ${(error && error.message) || error}`;
        }
    } else {
        nativeNote = 'no native boundary in this build (browser) — the desktop app has one';
    }
    let worker = [];
    try {
        worker = workerRows(typeof workerDiagnostics === 'function' ? workerDiagnostics() : []);
    } catch (error) {
        worker = [];
    }
    return {native, worker, nativeNote};
};

const defaultSources = () => ({
    invoke: (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.core &&
        typeof window.__TAURI__.core.invoke === 'function') ?
        window.__TAURI__.core.invoke : null,
    workerDiagnostics: (typeof window !== 'undefined' &&
        typeof window.__brickwrightCapabilityDiagnostics === 'function') ?
        window.__brickwrightCapabilityDiagnostics : null
});

const el = (tag, style, text) => {
    const node = document.createElement(tag);
    if (style) node.setAttribute('style', style);
    if (text !== undefined) node.textContent = text;
    return node;
};

let panel = null;

export const closePanel = () => {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
};

export const openPanel = () => {
    if (panel) return panel;
    panel = el('div', [
        'position:fixed;inset:0;z-index:2147483600;',
        'background:#12161c;color:#d7dde4;',
        'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
        'display:flex;flex-direction:column;',
        'padding:env(safe-area-inset-top) env(safe-area-inset-right)',
        ' env(safe-area-inset-bottom) env(safe-area-inset-left);'
    ].join(''));
    panel.setAttribute('data-testid', 'bw-capability-diagnostics');

    const header = el('div', 'display:flex;align-items:center;gap:8px;padding:10px 12px;' +
        'background:#1b2129;border-bottom:1px solid #2a323d;flex:0 0 auto;flex-wrap:wrap;');
    header.appendChild(el('strong', 'font-size:13px;margin-right:auto;', 'Capability diagnostics'));

    const body = el('pre', 'flex:1 1 auto;overflow:auto;padding:8px 12px;margin:0;' +
        'white-space:pre-wrap;-webkit-overflow-scrolling:touch;');
    body.setAttribute('data-testid', 'bw-capability-diagnostics-body');

    const paint = async () => {
        const sources = defaultSources();
        const {native, worker, nativeNote} = await collect(sources);
        body.textContent = asText(native, worker, nativeNote);
    };

    const button = (label, onClick) => {
        const b = el('button', 'background:#2a323d;color:#d7dde4;border:0;border-radius:6px;' +
            'padding:7px 12px;font:inherit;cursor:pointer;', label);
        b.addEventListener('click', onClick);
        header.appendChild(b);
        return b;
    };
    button('Refresh', () => { paint(); });
    button('Close', closePanel);

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);
    paint();
    return panel;
};

export default function initCapabilityDiagnostics () {
    if (typeof window === 'undefined') return;
    window.addEventListener('bw-open-capability-diagnostics', openPanel);
    window.__brickwrightCapabilityPanel = {open: openPanel, close: closePanel, collect, asText};
}
