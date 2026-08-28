/**
 * A connection log you can read ON the device.
 *
 * The whole reason this file exists: on iOS there is no console. A hub that
 * refuses to connect produces a `console.error` nobody can see, the extension
 * shows "not connected", and that is the entire diagnosis available to a user
 * — or to us, from a bug report. Safari's Web Inspector can be attached from a
 * Mac, but that is not a thing a classroom can do.
 *
 * So: every console call, every uncaught error, and every frame of the native
 * BLE JSON-RPC lands in a ring buffer, and a panel renders it in the app.
 *
 * Deliberately plain DOM with inline styles, and no imports from the rest of the
 * GUI. It has to keep working when the thing being diagnosed is the GUI, and it
 * has to survive a build that has gone wrong somewhere else.
 */

const MAX_ENTRIES = 1000;
/** Per-argument cap. A stringified VM object can be megabytes; the tail is never the interesting part. */
const MAX_ARG_CHARS = 500;

const entries = [];
const listeners = new Set();
let seq = 0;

const formatArg = arg => {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    if (arg instanceof Uint8Array) {
        return `<${arg.length} bytes: ${Array.from(arg.slice(0, 24))
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ')}${arg.length > 24 ? ' …' : ''}>`;
    }
    try {
        // A DataView / ArrayBuffer stringifies to "{}", which is worse than useless.
        if (ArrayBuffer.isView(arg) || arg instanceof ArrayBuffer) {
            const view = new Uint8Array(arg.buffer || arg);
            return formatArg(view);
        }
        return JSON.stringify(arg);
    } catch (e) {
        return String(arg);
    }
};

const formatArgs = args => Array.prototype.slice.call(args, 0, 8)
    .map(a => {
        const s = formatArg(a);
        return s.length > MAX_ARG_CHARS ? `${s.slice(0, MAX_ARG_CHARS)}…` : s;
    })
    .join(' ');

/**
 * Append one line.
 * @param {string} level one of log/info/warn/error/debug — drives the colour only.
 * @param {string} tag groups related lines ('ble', 'console', 'uncaught', …). Not a
 *   filter: a log you must configure before it records what you needed is not a log.
 * @param {...*} args formatted and joined, each capped so one huge object cannot
 *   crowd out the surrounding lines.
 * @returns {object} the stored entry.
 */
export const bleLog = (level, tag, ...args) => {
    const entry = {
        n: ++seq,
        t: Date.now(),
        level,
        tag,
        text: formatArgs(args)
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    listeners.forEach(fn => {
        try {
            fn(entry);
        } catch (e) {
            // A broken renderer must not break logging.
        }
    });
    return entry;
};

export const getEntries = () => entries.slice();
export const clearEntries = () => {
    entries.length = 0;
    listeners.forEach(fn => fn(null));
};
export const onEntry = fn => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

/**
 * What the environment can and cannot do, as facts rather than guesses. Every
 * row here has been the answer to "why does Bluetooth do nothing" at least once.
 * @returns {object} label → value, rendered verbatim at the top of the panel.
 */
export const environmentReport = () => {
    const w = typeof window === 'undefined' ? {} : window;
    const n = typeof navigator === 'undefined' ? {} : navigator;
    return {
        'user agent': n.userAgent || '(unknown)',
        'native app (Tauri)': !!w.__TAURI__,
        'Web Bluetooth': typeof n.bluetooth === 'undefined' ?
            'absent' :
            (n.bluetooth.__brickwrightShim ? 'Brickwright native shim' : 'browser built-in'),
        'Web Serial': typeof n.serial === 'undefined' ? 'absent' : 'present',
        'secure context': typeof w.isSecureContext === 'boolean' ? String(w.isSecureContext) : '(unknown)',
        'origin': w.location ? w.location.origin : '(unknown)',
        'app version': (w.__TAURI__ && w.__TAURI__.app) ? 'native' : 'web'
    };
};

const asText = () => {
    const env = environmentReport();
    const head = Object.keys(env).map(k => `${k}: ${env[k]}`)
        .join('\n');
    const body = entries.map(e => {
        const ts = new Date(e.t).toISOString()
            .slice(11, 23);
        return `${ts} [${e.level}] ${e.tag}: ${e.text}`;
    }).join('\n');
    return `Brickwright connection log\n==========================\n${head}\n\n${body}\n`;
};

/* ------------------------------------------------------------------ panel */

const LEVEL_COLOR = {
    error: '#ff6b6b',
    warn: '#ffc93c',
    info: '#8ecae6',
    debug: '#9aa5b1',
    log: '#d7dde4'
};

let panel = null;
let unsubscribe = null;

const el = (tag, style, text) => {
    const node = document.createElement(tag);
    if (style) node.setAttribute('style', style);
    if (typeof text === 'string') node.textContent = text;
    return node;
};

const renderRow = entry => {
    const row = el('div', 'padding:2px 0;border-bottom:1px solid rgba(255,255,255,.06);' +
        'white-space:pre-wrap;word-break:break-word;');
    const ts = el('span', 'color:#6b7785;', `${new Date(entry.t).toISOString()
        .slice(11, 23)} `);
    const tag = el('span', `color:${LEVEL_COLOR[entry.level] || LEVEL_COLOR.log};`, `${entry.tag} `);
    row.appendChild(ts);
    row.appendChild(tag);
    row.appendChild(document.createTextNode(entry.text));
    return row;
};

export const closePanel = () => {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
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
        // The status bar / notch. Without this the close button is unreachable
        // on a phone, which turns a diagnostics tool into a trap.
        'padding:env(safe-area-inset-top) env(safe-area-inset-right)',
        ' env(safe-area-inset-bottom) env(safe-area-inset-left);'
    ].join(''));

    const header = el('div', 'display:flex;align-items:center;gap:8px;padding:10px 12px;' +
        'background:#1b2129;border-bottom:1px solid #2a323d;flex:0 0 auto;flex-wrap:wrap;');
    header.appendChild(el('strong', 'font-size:13px;margin-right:auto;', 'Connection diagnostics'));

    const button = (label, onClick) => {
        const b = el('button', 'background:#2a323d;color:#d7dde4;border:0;border-radius:6px;' +
            'padding:7px 12px;font:inherit;cursor:pointer;', label);
        b.addEventListener('click', onClick);
        header.appendChild(b);
        return b;
    };

    const envBox = el('div', 'padding:8px 12px;background:#161b22;border-bottom:1px solid #2a323d;' +
        'flex:0 0 auto;white-space:pre-wrap;color:#9aa5b1;max-height:32vh;overflow:auto;');
    const list = el('div', 'flex:1 1 auto;overflow:auto;padding:8px 12px;-webkit-overflow-scrolling:touch;');

    const paintEnv = extra => {
        const env = environmentReport();
        const lines = Object.keys(env).map(k => `${k}: ${env[k]}`);
        envBox.textContent = lines.concat(extra || []).join('\n');
    };

    const repaint = () => {
        list.textContent = '';
        entries.forEach(e => list.appendChild(renderRow(e)));
        list.scrollTop = list.scrollHeight;
    };

    const selfTest = button('Run Bluetooth self-test', async () => {
        selfTest.disabled = true;
        selfTest.textContent = 'Testing…';
        try {
            // Imported lazily so the panel keeps working even if the native
            // module is what is broken.
            const {selfTestReport} = await import('./native-ble.js');
            const report = await selfTestReport();
            paintEnv(['', '— self-test —'].concat(
                Object.keys(report).map(k => `${k}: ${report[k]}`)
            ));
        } catch (e) {
            const message = e && e.message ? e.message : e;
            // Loading the transport is itself part of reaching the bundled
            // service. Preserve the stable, user-searchable field name even
            // when webpack/chunk loading fails before native-ble can return
            // its normal report; a bare "self-test failed" hid which service
            // was unavailable in CI and in screenshots from iPad users.
            paintEnv(['', '— self-test —',
                `local Bluetooth service: UNREACHABLE — self-test could not load: ${message}`]);
        }
        selfTest.disabled = false;
        selfTest.textContent = 'Run Bluetooth self-test';
    });

    button('Copy', async () => {
        const text = asText();
        try {
            await navigator.clipboard.writeText(text);
            bleLog('info', 'diag', 'log copied to the clipboard');
        } catch (e) {
            // WKWebView refuses the clipboard often enough that a fallback is
            // not optional: show the text so it can be selected by hand.
            const ta = el('textarea', 'position:fixed;inset:10% 5%;z-index:2147483601;' +
                'width:90%;height:80%;font:inherit;');
            ta.value = text;
            panel.appendChild(ta);
            ta.select();
        }
    });
    button('Clear', () => {
        clearEntries();
        repaint();
    });
    button('Close', closePanel);

    paintEnv();
    repaint();
    panel.appendChild(header);
    panel.appendChild(envBox);
    panel.appendChild(list);
    document.body.appendChild(panel);

    unsubscribe = onEntry(entry => {
        if (!entry) {
            repaint();
            return;
        }
        const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 24;
        list.appendChild(renderRow(entry));
        if (atBottom) list.scrollTop = list.scrollHeight;
    });
    return panel;
};

/* ------------------------------------------------------------------- init */

let installed = false;

/**
 * Mirror the console and the global error handlers into the ring buffer, and
 * make the panel reachable. Idempotent.
 *
 * The console is mirrored, never replaced: everything still reaches the real
 * console for anyone who does have devtools.
 */
export default function initBleDiagnostics () {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    ['log', 'info', 'warn', 'error', 'debug'].forEach(level => {
        const original = console[level];
        if (typeof original !== 'function') return;
        console[level] = function (...args) {
            try {
                bleLog(level, 'console', ...args);
            } catch (e) {
                // never let logging break the app
            }
            return original.apply(console, args);
        };
    });

    // The Scratch Link path was a blind spot: scratch-vm's ScratchLinkWebSocket
    // opens RAW WebSockets (ws://127.0.0.1:20111 and the wss:// cloud one, both
    // at once) and reports failure only as a generic extension error. On a phone
    // with no devtools that is indistinguishable from "the button did nothing" —
    // which is exactly how it was reported. Wrapping the constructor says which
    // URL was dialled and what became of it.
    //
    // Only scratch-link endpoints are logged; every other socket passes through
    // untouched. The wrapper never swallows: it adds listeners rather than
    // replacing on* handlers, so the VM's own handlers still fire.
    const NativeWebSocket = window.WebSocket;
    if (typeof NativeWebSocket === 'function' && !NativeWebSocket.__bwWrapped) {
        const isLink = url => /:(20110|20111)\//.test(String(url));
        const Wrapped = function WebSocket (url, protocols) {
            const ws = protocols === undefined
                ? new NativeWebSocket(url)
                : new NativeWebSocket(url, protocols);
            if (isLink(url)) {
                const started = Date.now();
                const since = () => `${Date.now() - started}ms`;
                bleLog('info', 'scratchlink', 'dialling', String(url));
                ws.addEventListener('open', () =>
                    bleLog('info', 'scratchlink', 'OPEN', String(url), since()));
                // An error event on a WebSocket carries no reason by design, so
                // saying which URL failed and how long it took is the whole of
                // what can honestly be reported here.
                ws.addEventListener('error', () =>
                    bleLog('error', 'scratchlink', 'ERROR', String(url), since()));
                ws.addEventListener('close', event =>
                    bleLog('warn', 'scratchlink', 'CLOSE', String(url),
                        `code=${event.code}`, `clean=${event.wasClean}`, since()));

                // The frames, not just the lifecycle. A socket that opens and
                // then goes quiet is the failure that looks like "the button
                // did nothing", and the only thing that distinguishes its
                // causes is WHICH request got no reply. Truncated so a chatty
                // notify stream cannot flush the ring buffer.
                const brief = data => {
                    if (typeof data !== 'string') return `<${(data && data.byteLength) || '?'} bytes>`;
                    return data.length > 300 ? `${data.slice(0, 300)}…` : data;
                };
                const nativeSend = ws.send.bind(ws);
                ws.send = data => {
                    bleLog('debug', 'scratchlink', '→', brief(data));
                    return nativeSend(data);
                };
                ws.addEventListener('message', event =>
                    bleLog('debug', 'scratchlink', '←', brief(event.data)));
            }
            return ws;
        };
        Wrapped.prototype = NativeWebSocket.prototype;
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => {
            Wrapped[k] = NativeWebSocket[k];
        });
        Wrapped.__bwWrapped = true;
        try {
            window.WebSocket = Wrapped;
        } catch (e) {
            bleLog('warn', 'diag', 'could not wrap WebSocket', e && e.message);
        }
    }

    window.addEventListener('error', event => {
        bleLog('error', 'uncaught', event.message,
            `${event.filename || '?'}:${event.lineno || 0}`);
    });
    window.addEventListener('unhandledrejection', event => {
        const r = event.reason;
        bleLog('error', 'unhandled-rejection', r && r.message ? r.message : r);
    });

    // Three ways in, because the one you remember is never the one that works:
    // the Settings menu item, a URL hash for a device with no menu, and the
    // console/global for anyone who does have a debugger attached.
    window.addEventListener('bw-open-ble-diagnostics', openPanel);
    if (String(window.location.hash).indexOf('ble-debug') !== -1) {
        window.addEventListener('load', openPanel);
    }
    window.__brickwrightDiagnostics = {
        open: openPanel,
        close: closePanel,
        log: bleLog,
        entries: getEntries,
        text: asText,
        environment: environmentReport
    };

    bleLog('info', 'diag', 'diagnostics ready',
        JSON.stringify(environmentReport()));
}
