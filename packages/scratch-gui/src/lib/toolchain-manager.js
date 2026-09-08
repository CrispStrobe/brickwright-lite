/**
 * The SDCC toolchain, managed by the person who has to live with it.
 *
 * SDCC is GPL-2.0-or-later. This application is BSD-3-Clause. Since 2026-09-07
 * the compiler is not shipped inside it: the default route sends a program to
 * the hosted compiler service, and anyone who wants to build offline downloads
 * the toolchain from its own GPL origin. Until now that switch existed only as
 * `?localCompiler=on` and a localStorage key — reachable from a browser console
 * and nowhere else. This is the surface for it.
 *
 * IT IS A DOWNLOAD MANAGER, NOT A TOGGLE WITH A SPINNER. The states a person
 * actually needs are: which route is in use and what it costs them; whether the
 * toolchain is here and how much room it takes; a download that reports real
 * progress and can be stopped; recovery from a stopped one; and removal. A
 * checkbox would express the first of those and hide the rest.
 *
 * PROGRESS IS WEIGHTED BY BYTES, not by files. Of 1,697,996 bytes over the
 * wire, runtime.json is 607,272 and sdcc.wasm 452,349 — two of nine files are
 * 62% of the wait. Nine equal steps would advance briskly through the small
 * ones and then sit still, which reads as frozen exactly when someone most
 * needs telling that it is not.
 *
 * THE LICENCE IS DISCLOSED AT THE MOMENT OF DOWNLOAD, not buried in a file
 * nobody opens. This is the point where a user pulls GPL software from a
 * separate origin into a BSD-3 application, and saying so is what makes the
 * separation visible to the person it protects.
 */

import {
    GPL_TOOLCHAIN_ORIGIN, TOOLCHAIN_FILES,
    getToolchainMode, setToolchainMode, localToolchainEnabled,
    primeToolchainCache, inspectToolchain, removeToolchain, measureToolchain
} from './sdcc-wasm/toolchain-source.js';

const el = (tag, style, text) => {
    const node = document.createElement(tag);
    if (style) node.setAttribute('style', style);
    if (text !== undefined) node.textContent = text;
    return node;
};

const mib = bytes => `${(bytes / 1048576).toFixed(1)} MB`;

let panel = null;
let controller = null;

export const closePanel = () => {
    // A download in flight is NOT cancelled by closing the window. Closing a
    // dialog is not a decision about the download, and a half-finished
    // toolchain resumes from where it stopped anyway.
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
};

export const openPanel = () => {
    if (panel) return panel;
    panel = el('div', [
        'position:fixed;inset:0;z-index:2147483600;',
        'background:#12161c;color:#d7dde4;',
        'font:13px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;',
        'display:flex;flex-direction:column;',
        'padding:env(safe-area-inset-top) env(safe-area-inset-right)',
        ' env(safe-area-inset-bottom) env(safe-area-inset-left);'
    ].join(''));
    panel.setAttribute('data-testid', 'bw-toolchain-manager');

    const header = el('div', 'display:flex;align-items:center;gap:8px;padding:10px 12px;' +
        'background:#1b2129;border-bottom:1px solid #2a323d;flex:0 0 auto;flex-wrap:wrap;');
    header.appendChild(el('strong', 'font-size:14px;margin-right:auto;', 'C compiler for 8051 boards'));

    const body = el('div', 'flex:1 1 auto;overflow:auto;padding:14px 16px;max-width:760px;');
    const status = el('div', 'margin-bottom:14px;');
    status.setAttribute('data-testid', 'bw-toolchain-status');
    const choices = el('div', 'display:flex;flex-direction:column;gap:10px;margin-bottom:16px;');
    const actions = el('div', 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;');
    const progress = el('div', 'margin-top:14px;');
    progress.setAttribute('data-testid', 'bw-toolchain-progress');

    const button = (label, onClick, testid) => {
        const b = el('button', 'background:#2a323d;color:#d7dde4;border:0;border-radius:6px;' +
            'padding:8px 14px;font:inherit;cursor:pointer;', label);
        if (testid) b.setAttribute('data-testid', testid);
        b.addEventListener('click', onClick);
        return b;
    };

    const note = (text, style = '') =>
        el('p', `margin:4px 0 0;color:#98a4b3;font-size:12px;${style}`, text);

    /** One radio per mode, each saying what it costs rather than only naming itself. */
    // The test id is passed as a LITERAL rather than assembled from `mode`.
    // `bw-toolchain-mode-${mode}` reads fine and is invisible to everyone who
    // will ever look for it — a browser gate, a person grepping, or the census
    // this repo wrote up as species 28, "a census by literal cannot see an
    // assembled value". A selector nobody can find is not a selector. My own
    // test caught this, which is the only reason it is not still assembled.
    const modeRow = (mode, testid, title, detail) => {
        const row = el('label', 'display:flex;gap:10px;align-items:flex-start;cursor:pointer;' +
            'padding:10px;border:1px solid #2a323d;border-radius:8px;');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'bw-toolchain-mode';
        input.value = mode;
        input.checked = getToolchainMode() === mode;
        input.setAttribute('data-testid', testid);
        input.addEventListener('change', () => {
            if (input.checked) {
                setToolchainMode(mode);
                paint();
            }
        });
        const text = el('div');
        text.appendChild(el('div', 'font-weight:600;', title));
        text.appendChild(note(detail));
        row.appendChild(input);
        row.appendChild(text);
        return row;
    };

    const paint = async () => {
        const report = await inspectToolchain(GPL_TOOLCHAIN_ORIGIN).catch(() => null);
        const installed = report && report.complete;
        const partial = report && !report.complete && report.present.length > 0;

        status.textContent = '';
        status.appendChild(el('div', 'font-size:13px;',
            installed
                ? `The compiler is on this device — ${report.present.length} files, ${mib(report.bytes)}.`
                : partial
                    ? `Partly downloaded — ${report.present.length} of ${TOOLCHAIN_FILES.length} files. ` +
                      'Downloading again continues from here.'
                    : 'The compiler is not on this device.'));
        status.appendChild(note(localToolchainEnabled()
            ? 'Programs for the five supported 8051 chips build in this page, with no connection.'
            : 'Programs are sent to the compiler service to be built, so this needs a connection.'));

        choices.textContent = '';
        choices.appendChild(modeRow('online', 'bw-toolchain-mode-online', 'Build online (default)',
            'Your program is sent to the compiler service. Nothing is downloaded.'));
        choices.appendChild(modeRow('local', 'bw-toolchain-mode-local', 'Build in this page',
            'Downloads the compiler once (about 1.7 MB) and keeps it here, so builds work offline.'));

        actions.textContent = '';
        if (!installed) {
            actions.appendChild(button(partial ? 'Continue download' : 'Download compiler',
                download, 'bw-toolchain-download'));
        }
        if (installed || partial) {
            actions.appendChild(button('Remove from this device', remove, 'bw-toolchain-remove'));
        }
        actions.appendChild(button('Close', closePanel, 'bw-toolchain-close'));

        progress.textContent = '';
        // THE LICENCE, at the point of decision. Named, versioned, and linked to
        // the offer of source — not a line in a file nobody opens.
        const licence = el('div', 'margin-top:18px;padding-top:12px;border-top:1px solid #2a323d;');
        licence.setAttribute('data-testid', 'bw-toolchain-licence');
        licence.appendChild(note(
            'The compiler is SDCC (Small Device C Compiler) 4.5.0, licensed GPL-2.0-or-later. ' +
            'That is not the licence of this application, which is why it is downloaded separately ' +
            'and only when you ask. Its source, the written offer of corresponding source, and a ' +
            'SHA-256 for each file are at:'));
        const link = el('a', 'color:#7cc4ff;font-size:12px;', 'github.com/CrispStrobe/sdcc-wasm');
        link.href = 'https://github.com/CrispStrobe/sdcc-wasm';
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
        licence.appendChild(link);
        progress.appendChild(licence);
    };

    const download = async () => {
        controller = new AbortController();
        progress.textContent = '';
        const line = el('div', 'font-size:12px;color:#d7dde4;', 'Preparing…');
        line.setAttribute('data-testid', 'bw-toolchain-progress-line');
        const barOuter = el('div', 'height:8px;background:#2a323d;border-radius:4px;margin:8px 0;' +
            'overflow:hidden;');
        const barInner = el('div', 'height:100%;width:0%;background:#7cc4ff;transition:width .2s;');
        barOuter.appendChild(barInner);
        const stop = button('Stop', () => controller && controller.abort(), 'bw-toolchain-stop');
        progress.appendChild(line);
        progress.appendChild(barOuter);
        progress.appendChild(stop);
        actions.textContent = '';

        let totalBytes = 0;
        let sizes = null;
        try {
            ({sizes, total: totalBytes} = await measureToolchain(GPL_TOOLCHAIN_ORIGIN));
        } catch {
            // No denominator: report files rather than inventing a percentage.
            sizes = null;
        }
        try {
            await primeToolchainCache(GPL_TOOLCHAIN_ORIGIN, {
                signal: controller.signal, sizes, totalBytes,
                onProgress: ({name, index, total, state, bytesDone, totalBytes: all}) => {
                    if (state === 'fetching') {
                        line.textContent = all
                            ? `Downloading ${name} — ${mib(bytesDone)} of ${mib(all)}`
                            : `Downloading ${name} — ${index + 1} of ${total}`;
                    }
                    if (all) barInner.style.width = `${Math.round((bytesDone / all) * 100)}%`;
                    else barInner.style.width = `${Math.round(((index + 1) / total) * 100)}%`;
                }
            });
            // Downloading it is a request to use it; leaving the mode on
            // `online` afterwards would make the download pointless.
            setToolchainMode('local');
            await paint();
        } catch (error) {
            const stopped = error && error.name === 'AbortError';
            progress.textContent = '';
            progress.appendChild(el('div', `font-size:12px;color:${stopped ? '#d7dde4' : '#ff9b9b'};`,
                stopped
                    ? 'Stopped. The files already downloaded are kept — starting again continues from here.'
                    : `Download failed: ${error && error.message ? error.message : error}`));
            const again = button('Try again', download, 'bw-toolchain-retry');
            progress.appendChild(again);
            await paint();
        } finally {
            controller = null;
        }
    };

    const remove = async () => {
        await removeToolchain(GPL_TOOLCHAIN_ORIGIN).catch(() => []);
        // Removing it means it cannot build here any more; leaving the mode on
        // `local` would leave every build failing with the toolchain absent.
        setToolchainMode('online');
        await paint();
    };

    header.appendChild(button('Close', closePanel));
    body.appendChild(status);
    body.appendChild(choices);
    body.appendChild(actions);
    body.appendChild(progress);
    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);
    paint();
    return panel;
};

export default function initToolchainManager () {
    if (typeof window === 'undefined') return;
    window.addEventListener('bw-open-toolchain-manager', openPanel);
    window.__brickwrightToolchainPanel = {open: openPanel, close: closePanel};
}
