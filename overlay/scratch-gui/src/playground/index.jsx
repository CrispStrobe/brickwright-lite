// Polyfills
// Brickwright: three of upstream's four startup polyfills are gone. .browserslistrc
// floors at Chrome 63 / Edge 15 / Firefox 57 / Safari 11 / iOS 11, and every one
// of those has Object.assign, Array.prototype.includes and Intl natively — the
// `intl` package alone was 170 KiB of source in the boot vendor chunk, imported
// "for Safari 9", two major versions below the floor. Promise.prototype.finally
// STAYS: Safari 11.0 shipped without it (11.1 added it), and the floor is 11.
// scripts/verify-boot-payload.mjs asserts the Intl polyfill is in no script.
import 'core-js/fn/promise/finally';

import React from 'react';
import ReactDOM from 'react-dom';

import AppStateHOC from '../lib/app-state-hoc.jsx';
import BrowserModalComponent from '../components/browser-modal/browser-modal.jsx';
import supportedBrowser from '../lib/supported-browser';

import styles from './index.css';

const appTarget = document.createElement('div');
appTarget.className = styles.app;
document.body.appendChild(appTarget);

if (supportedBrowser()) {
    // require needed here to avoid importing unsupported browser-crashing code
    // at the top level
    require('./render-gui.jsx').default(appTarget);

} else {
    BrowserModalComponent.setAppElement(appTarget);
    const WrappedBrowserModalComponent = AppStateHOC(BrowserModalComponent, true /* localesOnly */);
    const handleBack = () => {};
    // eslint-disable-next-line react/jsx-no-bind
    ReactDOM.render(<WrappedBrowserModalComponent onBack={handleBack} />, appTarget);
}
