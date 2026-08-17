"use strict";
(self["webpackChunkGUI"] = self["webpackChunkGUI"] || []).push([["bw-microbit-sim"],{

/***/ "./src/components/tw-pseudocode/microbit-sim-pane.jsx":
/*!************************************************************!*\
  !*** ./src/components/tw-pseudocode/microbit-sim-pane.jsx ***!
  \************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react */ "./node_modules/react/index.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }

const L10N = {
  en: {
    simTitle: 'micro:bit simulator',
    stop: '⏹ Stop',
    reset: '🔄 Reset',
    clear: '🗑 Clear',
    running: 'Running',
    ready: 'Ready',
    loading: 'Loading…',
    serialPlaceholder: '(serial output appears here)'
  },
  de: {
    simTitle: 'micro:bit-Simulator',
    stop: '⏹ Stopp',
    reset: '🔄 Zurücksetzen',
    clear: '🗑 Leeren',
    running: 'Läuft',
    ready: 'Bereit',
    loading: 'Wird geladen…',
    serialPlaceholder: '(serielle Ausgabe erscheint hier)'
  }
};
const pickLocale = () => {
  try {
    return /^de/i.test(navigator.language) ? 'de' : 'en';
  } catch (_unused) {
    return 'en';
  }
};

/**
 * MicrobitSimPane — hosts the self-hosted micro:bit MicroPython simulator
 * in an iframe and wires the postMessage protocol.
 *
 * Protocol (simulator → parent):
 *   {kind: 'ready', state}          sim loaded, waiting for flash
 *   {kind: 'request_flash'}         play button pressed, send code
 *   {kind: 'serial_output', data}   serial print output
 *   {kind: 'state_change', change}  LED/button/sensor state
 *
 * Protocol (parent → simulator):
 *   {kind: 'flash', filesystem}     send {filename: Uint8Array} to run
 *   {kind: 'stop'}                  stop the program
 *   {kind: 'reset'}                 reset and re-run
 */

const SIM_URL = 'static/microbit-sim/simulator.html';
class MicrobitSimPane extends react__WEBPACK_IMPORTED_MODULE_0__.Component {
  constructor(props) {
    super(props);
    this.state = {
      serial: '',
      simReady: false,
      running: false
    };
    this._iframeRef = /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createRef();
    this._pendingCode = null;
    this._onMessage = this._onMessage.bind(this);
    this._onFlashEvent = this._onFlashEvent.bind(this);
  }
  componentDidMount() {
    window.addEventListener('message', this._onMessage);
    window.addEventListener('bw-microbit-flash', this._onFlashEvent);
  }
  componentWillUnmount() {
    window.removeEventListener('message', this._onMessage);
    window.removeEventListener('bw-microbit-flash', this._onFlashEvent);
  }
  _onFlashEvent(e) {
    const code = e.detail && e.detail.code;
    if (!code) return;
    if (this.state.simReady) {
      this._flash(code);
    } else {
      this._pendingCode = code;
    }
  }
  _onMessage(e) {
    const iframe = this._iframeRef.current;
    if (!iframe || e.source !== iframe.contentWindow) return;
    const {
      kind
    } = e.data || {};
    switch (kind) {
      case 'ready':
        this.setState({
          simReady: true
        });
        if (this._pendingCode) {
          this._flash(this._pendingCode);
          this._pendingCode = null;
        }
        break;
      case 'request_flash':
        // User clicked the play button inside the sim
        if (this._pendingCode) {
          this._flash(this._pendingCode);
          this._pendingCode = null;
        }
        break;
      case 'serial_output':
        if (typeof e.data.data === 'string') {
          this.setState(s => ({
            serial: s.serial + e.data.data
          }));
        }
        break;
      case 'state_change':
        // Could be used for LED readback, etc. — not wired yet.
        break;
    }
  }
  _flash(code) {
    const iframe = this._iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    const encoder = new TextEncoder();
    const filesystem = {
      'main.py': encoder.encode(code)
    };
    iframe.contentWindow.postMessage({
      kind: 'flash',
      filesystem
    }, '*');
    this.setState({
      running: true,
      serial: ''
    });
  }
  _stop() {
    const iframe = this._iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({
      kind: 'stop'
    }, '*');
    this.setState({
      running: false
    });
  }
  _reset() {
    const iframe = this._iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({
      kind: 'reset'
    }, '*');
    this.setState({
      serial: '',
      running: true
    });
  }
  render() {
    const t = L10N[pickLocale()];
    const btn = {
      padding: '4px 12px',
      borderRadius: 6,
      border: 'none',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: 12,
      color: '#fff'
    };
    return /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#f8fafc'
      },
      "data-testid": "bw-microbit-sim-pane"
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        flex: '1 1 auto',
        minHeight: 200,
        position: 'relative'
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("iframe", {
      ref: this._iframeRef,
      src: SIM_URL,
      title: t.simTitle,
      "data-testid": "bw-microbit-iframe",
      style: {
        width: '100%',
        height: '100%',
        border: 'none',
        background: '#fff',
        borderRadius: 8
      },
      sandbox: "allow-scripts allow-same-origin"
    })), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        display: 'flex',
        gap: 8,
        padding: '6px 8px',
        alignItems: 'center',
        flexShrink: 0
      }
    }, /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      type: "button",
      onClick: () => this._stop(),
      disabled: !this.state.running,
      style: _objectSpread(_objectSpread({}, btn), {}, {
        background: this.state.running ? '#dc2626' : '#94a3b8'
      }),
      "data-testid": "bw-microbit-stop"
    }, t.stop), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      type: "button",
      onClick: () => this._reset(),
      style: _objectSpread(_objectSpread({}, btn), {}, {
        background: '#2563eb'
      }),
      "data-testid": "bw-microbit-reset"
    }, t.reset), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("button", {
      type: "button",
      onClick: () => this.setState({
        serial: ''
      }),
      style: _objectSpread(_objectSpread({}, btn), {}, {
        background: '#6b7280'
      }),
      "data-testid": "bw-microbit-clear-serial"
    }, t.clear), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("span", {
      style: {
        fontSize: 11,
        color: '#64748b'
      }
    }, this.state.simReady ? this.state.running ? t.running : t.ready : t.loading)), /*#__PURE__*/react__WEBPACK_IMPORTED_MODULE_0__.createElement("div", {
      style: {
        flex: '0 0 auto',
        maxHeight: 160,
        minHeight: 60,
        overflow: 'auto',
        padding: '6px 8px',
        background: '#1e293b',
        color: '#e2e8f0',
        fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
        fontSize: 12,
        lineHeight: 1.4,
        borderTop: '1px solid #334155',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all'
      },
      "data-testid": "bw-microbit-serial"
    }, this.state.serial || t.serialPlaceholder));
  }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (MicrobitSimPane);

/***/ })

}]);