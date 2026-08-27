import React from 'react';
import ReactDOM from 'react-dom';
import {compose} from 'redux';

import AppStateHOC from '../lib/app-state-hoc.jsx';
import GUI from '../containers/gui.jsx';
import HashParserHOC from '../lib/hash-parser-hoc.jsx';
import log from '../lib/log.js';
import initBleDiagnostics from '../lib/ble-diagnostics.js';
import initScratchLinkTransport from '../lib/scratchlink-transport.js';
import installNativeWebBluetooth from '../lib/native-web-bluetooth.js';
import initTauriBridge from '../lib/tauri-bridge.js';
import initUrlExtensions from '../lib/url-extensions.js';
import {applyStoredChrome} from '../components/gui/chrome-toggle.jsx';

const onClickLogo = () => {
    /* Brickwright: no redirect to scratch.mit.edu */
};

const handleTelemetryModalCancel = () => {
    log('User canceled telemetry modal');
};

const handleTelemetryModalOptIn = () => {
    log('User opted into telemetry');
};

const handleTelemetryModalOptOut = () => {
    log('User opted out of telemetry');
};

/*
 * Render the GUI playground. This is a separate function because importing anything
 * that instantiates the VM causes unsupported browsers to crash
 * {object} appTarget - the DOM element to render to
 */
export default appTarget => {
    GUI.setAppElement(appTarget);

    // Mirror the console into an on-screen log FIRST, so everything after this
    // point — including a failure to install the Bluetooth shim — is readable on
    // a device with no devtools. Settings › Connection diagnostics opens it.
    initBleDiagnostics();

    // The Scratch Link carrier chooser (Settings › How Scratch Link connects…).
    // Registered early so the preference is readable before anything dials.
    initScratchLinkTransport();

    // Give the hardware extensions a `navigator.bluetooth` inside the app. No
    // webview we ship on implements Web Bluetooth, so without this every
    // extension whose default connection type is "ble" fails silently. No-op in
    // a browser that has the real thing, and in one that has neither.
    installNativeWebBluetooth();

    // Wire native file-open (Tauri) → web VM. No-op in a browser.
    initTauriBridge();

    // Load any ?extension=<url> from the address bar (Xcratch-style), once the
    // VM is up. Untrusted URLs prompt for confirmation first.
    initUrlExtensions();

    // note that redux's 'compose' function is just being used as a general utility to make
    // the hierarchy of HOC constructor calls clearer here; it has nothing to do with redux's
    // ability to compose reducers.
    const WrappedGui = compose(
        AppStateHOC,
        HashParserHOC
    )(GUI);

    // TODO a hack for testing the backpack, allow backpack host to be set by url param
    const backpackHostMatches = window.location.href.match(/[?&]backpack_host=([^&]*)&?/);
    const backpackHost = backpackHostMatches ? backpackHostMatches[1] : null;

    const scratchDesktopMatches = window.location.href.match(/[?&]isScratchDesktop=([^&]+)/);
    let simulateScratchDesktop;
    if (scratchDesktopMatches) {
        try {
            // parse 'true' into `true`, 'false' into `false`, etc.
            simulateScratchDesktop = JSON.parse(scratchDesktopMatches[1]);
        } catch {
            // it's not JSON so just use the string
            // note that a typo like "falsy" will be treated as true
            simulateScratchDesktop = scratchDesktopMatches[1];
        }
    }

    if (process.env.NODE_ENV === 'production' && typeof window === 'object') {
        // Warn before navigating away
        window.onbeforeunload = () => true;
    }

    // Before first paint, or the tall chrome flashes and then collapses.
    applyStoredChrome();
    ReactDOM.render(
        // important: this is checking whether `simulateScratchDesktop` is truthy, not just defined!
        simulateScratchDesktop ?
            <WrappedGui
                canEditTitle
                isScratchDesktop
                showTelemetryModal
                canSave={false}
                onTelemetryModalCancel={handleTelemetryModalCancel}
                onTelemetryModalOptIn={handleTelemetryModalOptIn}
                onTelemetryModalOptOut={handleTelemetryModalOptOut}
            /> :
            <WrappedGui
                canEditTitle
                backpackHost={backpackHost}
                canSave={false}
                onClickLogo={onClickLogo}
            />,
        appTarget);
};
