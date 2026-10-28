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

import {browserLocale, makeT} from './bw-i18n.js';

const KEY = 'bw-scratchlink-transport';

/**
 * Every carrier, in the order the chooser lists them.
 * `available()` decides whether an entry can be picked HERE — a greyed entry
 * with a reason beats a working-looking one that cannot run.
 */

/**
 * The transport chooser's own words. This module builds its panel directly
 * (see openPanel below), so these render to a person and are translated.
 *
 * `WebSocket`, `Scratch Link`, `Brickwright`, `Apple` and the ws:// address are
 * names and stay as they are in every language.
 */
const L10N = Object.freeze({
    en: Object.freeze({
        autoLabel: 'Automatic (recommended)',
        autoDetail: 'Try the in-app service first, fall back to the native channel if it does not answer.',
        socketLabel: 'In-app service (WebSocket)',
        socketDetail: 'Talk to Brickwright’s built-in Scratch Link over ws://127.0.0.1:20111. The only carrier in a web browser, where it reaches a desktop Scratch Link.',
        nativeLabel: 'Native channel (no socket)',
        nativeDetail: 'Carry the same messages through the app itself, opening no socket at all. For webviews that refuse one.',
        originalLabel: 'Original Scratch Link (Apple)',
        originalDetail: 'The reference implementation from the Scratch Foundation, vendored unmodified. Where the others and this disagree, this one is right.',
        nativeWhy: 'only inside the installed app',
        originalWhy: 'only on iPhone, iPad and Mac',
        panelTitle: 'How Scratch Link connects',
        panelIntro: 'This is how the Scratch Link messages reach the radio. It does not change ' +
            'which connection an extension uses — that stays in the extension’s own blocks.',
        panelNote: 'Reconnect the extension for a change to take effect.',
        panelDone: 'Done',
    }),
    de: Object.freeze({
        autoLabel: 'Automatisch (empfohlen)',
        autoDetail: 'Zuerst den In-App-Dienst versuchen und auf den nativen Kanal zurückfallen, wenn er nicht antwortet.',
        socketLabel: 'In-App-Dienst (WebSocket)',
        socketDetail: 'Mit Brickwrights eingebautem Scratch Link über ws://127.0.0.1:20111 sprechen. In einem Webbrowser der einzige Weg, und dort erreicht er ein Scratch Link auf dem Rechner.',
        nativeLabel: 'Nativer Kanal (ohne Socket)',
        nativeDetail: 'Dieselben Nachrichten durch die App selbst tragen, ganz ohne Socket. Für Webviews, die keinen zulassen.',
        originalLabel: 'Original Scratch Link (Apple)',
        originalDetail: 'Die Referenz-Implementierung der Scratch Foundation, unverändert eingebunden. Wo die anderen und diese sich widersprechen, hat diese recht.',
        nativeWhy: 'nur in der installierten App',
        originalWhy: 'nur auf iPhone, iPad und Mac',
        panelTitle: 'Wie Scratch Link verbindet',
        panelIntro: 'So erreichen die Scratch-Link-Nachrichten das Funkmodul. Es ändert nicht, ' +
            'welche Verbindung eine Erweiterung nutzt — das bleibt in ihren eigenen Blöcken.',
        panelNote: 'Verbinde die Erweiterung neu, damit eine Änderung wirkt.',
        panelDone: 'Fertig',
    })
});

const t = makeT(L10N);

export const transportsFor = locale => [
    {
        id: 'auto',
        label: t(locale, 'autoLabel'),
        detail: t(locale, 'autoDetail'),
        available: () => true,
    },
    {
        id: 'socket',
        label: t(locale, 'socketLabel'),
        detail: t(locale, 'socketDetail'),
        available: () => true,
    },
    {
        id: 'native',
        label: t(locale, 'nativeLabel'),
        detail: t(locale, 'nativeDetail'),
        available: () => isNativeApp(),
        why: t(locale, 'nativeWhy'),
    },
    {
        id: 'original',
        label: t(locale, 'originalLabel'),
        detail: t(locale, 'originalDetail'),
        // Wired now, through a Tauri plugin carrying the vendored Swift
        // (plugins/scratchlink-original). Apple-only because the reference is
        // Swift/CoreBluetooth; Android keeps our Rust routes.
        available: () => isNativeApp() && isApple(),
        why: t(locale, 'originalWhy'),
    },
];

/**
 * The carriers in English — the ids are what `getTransport`/`setTransport`
 * validate against, and no locale changes those. Anything that SHOWS a carrier
 * must call `transportsFor(locale)` instead.
 */
export const TRANSPORTS = transportsFor('en');

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
export const openPanel = arg => {
    // Also wired straight to addEventListener below, which calls it with an
    // Event — so only a string counts as a locale.
    const locale = typeof arg === 'string' ? arg : browserLocale();
    closePanel();
    const overlay = el('div', 'position:fixed;inset:0;z-index:2147483500;background:rgba(12,16,22,.72);' +
        'display:flex;align-items:center;justify-content:center;' +
        'font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;' +
        'padding:env(safe-area-inset-top) 16px env(safe-area-inset-bottom) 16px;');
    const card = el('div', 'background:#fff;color:#1b2129;border-radius:14px;width:min(520px,100%);' +
        'max-height:min(80vh,680px);display:flex;flex-direction:column;overflow:hidden;' +
        'box-shadow:0 18px 48px rgba(0,0,0,.35);');
    card.appendChild(el('div', 'padding:16px 18px 4px;font-weight:600;font-size:16px;',
        t(locale, 'panelTitle')));
    card.appendChild(el('div', 'padding:0 18px 10px;color:#5a6673;font-size:13px;',
        t(locale, 'panelIntro')));

    const list = el('div', 'flex:1 1 auto;overflow:auto;border-top:1px solid #e6eaee;' +
        '-webkit-overflow-scrolling:touch;');
    const current = getTransport();
    transportsFor(locale).forEach(t => {
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
                openPanel(locale);    // redraw so the selection is visible
            });
        }
        row.disabled = !ok;
        list.appendChild(row);
    });
    card.appendChild(list);

    const footer = el('div', 'padding:12px 18px;display:flex;gap:10px;justify-content:space-between;' +
        'align-items:center;border-top:1px solid #e6eaee;');
    footer.appendChild(el('div', 'color:#6b7785;font-size:12px;',
        t(locale, 'panelNote')));
    const close = el('button', 'background:#e9edf1;border:0;border-radius:8px;padding:9px 16px;' +
        'font:inherit;cursor:pointer;', t(locale, 'panelDone'));
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
