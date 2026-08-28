/**
 * Which way the Scratch Link route is carried — chosen by the user.
 *
 * NOT to be confused with the extension's own connection menu. That menu picks
 * WHICH PROTOCOL to speak (Web Bluetooth direct / Scratch Link / a user-run
 * bridge server). This picks HOW the Scratch Link protocol gets to the radio
 * once that choice is made. Several carriers exist because each has failed
 * somewhere: a webview that will not open a localhost socket, a platform
 * without our native channel, a device where only the reference implementation
 * behaves. Any one of them may be the only one that works on some machine
 * nobody has tested yet, so the user gets to say.
 */

const KEY = 'bw-scratchlink-transport';

/**
 * Every carrier, in the order the chooser lists them.
 * `available()` decides whether an entry can be picked HERE — a greyed entry
 * with a reason beats a working-looking one that cannot run.
 */
export const TRANSPORTS = [
    {
        id: 'auto',
        label: 'Automatic (recommended)',
        detail: 'Try the in-app service first, fall back to the native channel if it does not answer.',
        available: () => true,
    },
    {
        id: 'socket',
        label: 'In-app service (WebSocket)',
        detail: 'Talk to Brickwright’s built-in Scratch Link over ws://127.0.0.1:20111. ' +
            'The only carrier in a web browser, where it reaches a desktop Scratch Link.',
        available: () => true,
    },
    {
        id: 'native',
        label: 'Native channel (no socket)',
        detail: 'Carry the same messages through the app itself, opening no socket at all. ' +
            'For webviews that refuse one.',
        available: () => isNativeApp(),
        why: 'only inside the installed app',
    },
    {
        id: 'original',
        label: 'Original Scratch Link (Apple)',
        detail: 'The reference implementation from the Scratch Foundation, vendored unmodified. ' +
            'Where the others and this disagree, this one is right.',
        // The Swift sources are vendored and licence-gated, but nothing calls
        // them yet: build.rs compiles Objective-C through cc::Build, and Swift
        // needs a different toolchain path. Until that bridge exists this entry
        // would be selectable and do NOTHING — a dead transport that looks like
        // a working one, which is the single worst state for a connection
        // option to be in. Offering it and failing silently is how the Scratch
        // Link path wasted a day already.
        //
        // Flip this to `isNativeApp() && isApple()` in the same commit that
        // lands the bridge, not before.
        available: () => false,
        why: 'vendored, not wired up yet',
    },
];

/** @returns {boolean} true inside the Tauri shell. */
export const isNativeApp = () =>
    typeof window !== 'undefined' && typeof window.__TAURI__ !== 'undefined';

/** @returns {boolean} true on an Apple platform, where the Swift path can run. */
export const isApple = () => {
    try {
        const ua = String(navigator.userAgent || '');
        // iPadOS reports as Macintosh, which is fine: both are Apple platforms
        // and both can run the vendored Swift.
        return /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua);
    } catch (e) {
        return false;
    }
};

/**
 * The chosen carrier, falling back to 'auto' for an unknown or unavailable one.
 * @returns {string} a transport id that can actually run here.
 */
export const getTransport = () => {
    let stored = null;
    try {
        stored = localStorage.getItem(KEY);
    } catch (e) { /* private mode */ }
    const entry = TRANSPORTS.find(t => t.id === stored);
    // A stored choice that cannot run here must not silently do nothing — an
    // iPhone-only pick carried to a Linux desktop in a synced profile would
    // otherwise disable Bluetooth with no explanation.
    if (!entry || !entry.available()) return 'auto';
    return entry.id;
};

/**
 * @param {string} id the transport to use.
 * @returns {boolean} whether it was stored.
 */
export const setTransport = id => {
    if (!TRANSPORTS.some(t => t.id === id)) return false;
    try {
        localStorage.setItem(KEY, id);
        return true;
    } catch (e) {
        return false;
    }
};

/* ------------------------------------------------------------------ panel */

const el = (tag, style, text) => {
    const node = document.createElement(tag);
    if (style) node.setAttribute('style', style);
    if (typeof text === 'string') node.textContent = text;
    return node;
};

let panel = null;

/** Take the chooser down, if it is up. */
export const closePanel = () => {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
};

/**
 * Draw the chooser. Plain DOM rather than React for the same reason the
 * diagnostics panel is: it has to work when the app around it does not.
 * @returns {object} the panel element.
 */
export const openPanel = () => {
    closePanel();
    const overlay = el('div', 'position:fixed;inset:0;z-index:2147483500;background:rgba(12,16,22,.72);' +
        'display:flex;align-items:center;justify-content:center;' +
        'font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;' +
        'padding:env(safe-area-inset-top) 16px env(safe-area-inset-bottom) 16px;');
    const card = el('div', 'background:#fff;color:#1b2129;border-radius:14px;width:min(520px,100%);' +
        'max-height:min(80vh,680px);display:flex;flex-direction:column;overflow:hidden;' +
        'box-shadow:0 18px 48px rgba(0,0,0,.35);');
    card.appendChild(el('div', 'padding:16px 18px 4px;font-weight:600;font-size:16px;',
        'How Scratch Link connects'));
    card.appendChild(el('div', 'padding:0 18px 10px;color:#5a6673;font-size:13px;',
        'This is how the Scratch Link messages reach the radio. It does not change ' +
        'which connection an extension uses — that stays in the extension’s own blocks.'));

    const list = el('div', 'flex:1 1 auto;overflow:auto;border-top:1px solid #e6eaee;' +
        '-webkit-overflow-scrolling:touch;');
    const current = getTransport();
    TRANSPORTS.forEach(t => {
        const ok = t.available();
        const row = el('button', 'display:block;width:100%;text-align:left;background:none;' +
            `border:0;border-bottom:1px solid #f0f3f6;padding:12px 18px;font:inherit;` +
            `cursor:${ok ? 'pointer' : 'not-allowed'};opacity:${ok ? 1 : 0.5};`);
        const head = el('div', 'font-weight:600;display:flex;gap:8px;align-items:baseline;');
        head.appendChild(el('span', null, `${t.id === current ? '●' : '○'} ${t.label}`));
        if (!ok && t.why) head.appendChild(el('span', 'color:#6b7785;font-weight:400;font-size:12px;', t.why));
        row.appendChild(head);
        row.appendChild(el('div', 'color:#6b7785;font-size:12px;margin-top:2px;', t.detail));
        if (ok) {
            row.addEventListener('click', () => {
                setTransport(t.id);
                openPanel();          // redraw so the selection is visible
            });
        }
        row.disabled = !ok;
        list.appendChild(row);
    });
    card.appendChild(list);

    const footer = el('div', 'padding:12px 18px;display:flex;gap:10px;justify-content:space-between;' +
        'align-items:center;border-top:1px solid #e6eaee;');
    footer.appendChild(el('div', 'color:#6b7785;font-size:12px;',
        'Reconnect the extension for a change to take effect.'));
    const close = el('button', 'background:#e9edf1;border:0;border-radius:8px;padding:9px 16px;' +
        'font:inherit;cursor:pointer;', 'Done');
    close.addEventListener('click', closePanel);
    footer.appendChild(close);
    card.appendChild(footer);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    panel = overlay;
    return overlay;
};

/** Make the chooser reachable from the Settings menu. Idempotent. */
export default function initScratchLinkTransport () {
    if (typeof window === 'undefined') return 'no window';
    if (window.__bwScratchLinkTransport) return 'already installed';
    window.addEventListener('bw-open-scratchlink-transport', openPanel);
    window.__bwScratchLinkTransport = {open: openPanel, get: getTransport, set: setTransport};
    return 'installed';
}
