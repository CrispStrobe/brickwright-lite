import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {createMicrobitDebugController} from '../../lib/bw-debug/microbit-debug.js';

const L10N = {
    en: {
        simTitle: 'micro:bit simulator',
        stop: '⏹ Stop', reset: '🔄 Reset', clear: '🗑 Clear',
        running: 'Running', ready: 'Ready', loading: 'Loading…',
        serialPlaceholder: '(serial output appears here)',
        step: '⏭ Step', continue: '▶ Continue',
        paused: 'Paused', debugging: 'Debugging', pausedAt: 'Paused at block',
        vars: 'Variables', board: 'Board', trace: 'Trace',
        noVars: '(no variables)', pauseToInspect: 'Pause to inspect state'
    },
    de: {
        simTitle: 'micro:bit-Simulator',
        stop: '⏹ Stopp', reset: '🔄 Zurücksetzen', clear: '🗑 Leeren',
        running: 'Läuft', ready: 'Bereit', loading: 'Wird geladen…',
        serialPlaceholder: '(serielle Ausgabe erscheint hier)',
        step: '⏭ Schritt', continue: '▶ Weiter',
        paused: 'Angehalten', debugging: 'Debugging', pausedAt: 'Angehalten bei Block',
        vars: 'Variablen', board: 'Board', trace: 'Verlauf',
        noVars: '(keine Variablen)', pauseToInspect: 'Zum Inspizieren anhalten'
    }
};
const pickLocale = () => { try { return /^de/i.test(navigator.language) ? 'de' : 'en'; } catch { return 'en'; } };

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
 *   {kind: 'serial_input', data}    write a string to the program's serial-IN
 *   {kind: 'stop'}                  stop the program
 *   {kind: 'reset'}                 reset and re-run
 *
 * ## Debugging (MICROBIT-NATIVE Stage 3, Path A)
 *
 * A DEBUG flash carries `{code, debug:true, positions}`: the code is the
 * instrumented build from `generateMicroPython(project, {debug:true,
 * breakpoints})`, which prints RS(0x1e)-prefixed position markers over serial
 * and HALTS at breakpoints on `input()`. This pane owns the iframe — hence both
 * serial directions — so it hosts the micro:bit debug controller: it feeds every
 * serial_output chunk through the controller (which splits the markers from real
 * output and highlights `positions[n].block` via `vm.runtime.glowBlock`, the
 * SAME call the 8051 debugger uses), and its Step/Continue buttons resume the
 * halted program by writing `\x1es` / `\x1ec` back over serial_input. The
 * controller is a SEPARATE lightweight thing, NOT forced into the emulator's
 * `runFor` boundary-D contract (the sim has no program clock) — see
 * microbit-debug.js.
 */

const SIM_URL = 'static/microbit-sim/simulator.html';

class MicrobitSimPane extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            serial: '',
            simReady: false,
            running: false,
            // Mirror of the debug controller, for the render.
            dbg: {active: false, running: false, halted: false, block: null, index: null}
        };
        this._iframeRef = React.createRef();
        this._pendingCode = null;
        this._pendingDebug = null;   // {positions} when the pending flash is a debug run
        this._onMessage = this._onMessage.bind(this);
        this._onFlashEvent = this._onFlashEvent.bind(this);

        // The debug controller. Its highlight sink is vm.runtime.glowBlock —
        // read at call time so it survives a late-arriving vm — and its
        // serial-IN sink posts into the iframe. Kept off React state; it is a
        // controller, not render data (the render reads its snapshot via dbg).
        this._dbg = createMicrobitDebugController({
            glow: (blockId, on) => {
                const rt = this.props.vm && this.props.vm.runtime;
                if (rt && typeof rt.glowBlock === 'function') {
                    try { rt.glowBlock(blockId, on); } catch { /* stale block id */ }
                }
            },
            sendSerialIn: (text) => this._serialIn(text),
            onChange: (dbg) => this.setState({dbg})
        });
    }

    componentDidMount () {
        window.addEventListener('message', this._onMessage);
        window.addEventListener('bw-microbit-flash', this._onFlashEvent);
    }

    componentWillUnmount () {
        window.removeEventListener('message', this._onMessage);
        window.removeEventListener('bw-microbit-flash', this._onFlashEvent);
        // Clear any lingering block highlight when the pane goes away.
        this._dbg.stop();
    }

    _onFlashEvent (e) {
        const detail = (e && e.detail) || {};
        const code = detail.code;
        if (!code) return;
        const debug = detail.debug ? {positions: detail.positions || []} : null;
        if (this.state.simReady) {
            this._flash(code, debug);
        } else {
            this._pendingCode = code;
            this._pendingDebug = debug;
        }
    }

    _onMessage (e) {
        const iframe = this._iframeRef.current;
        if (!iframe || e.source !== iframe.contentWindow) return;
        const {kind} = e.data || {};
        switch (kind) {
        case 'ready':
            this.setState({simReady: true});
            if (this._pendingCode) {
                this._flash(this._pendingCode, this._pendingDebug);
                this._pendingCode = null;
                this._pendingDebug = null;
            }
            break;
        case 'request_flash':
            // User clicked the play button inside the sim
            if (this._pendingCode) {
                this._flash(this._pendingCode, this._pendingDebug);
                this._pendingCode = null;
                this._pendingDebug = null;
            }
            break;
        case 'serial_output':
            if (typeof e.data.data === 'string') {
                // Route through the debug controller: it splits RS-prefixed
                // markers out (driving the highlight/halt state) and returns
                // only the real program output. Outside a debug run it is a
                // passthrough, so this is unconditional.
                const text = this._dbg.feedSerial(e.data.data);
                if (text) this.setState(s => ({serial: s.serial + text}));
            }
            break;
        case 'state_change':
            // Could be used for LED readback, etc. — not wired yet.
            break;
        }
    }

    _flash (code, debug) {
        const iframe = this._iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;
        // A new flash ends any prior debug run (clears the old highlight).
        this._dbg.stop();
        if (debug) { this._dbg.begin(debug.positions); this._wireConditions(); }
        const encoder = new TextEncoder();
        const filesystem = {'main.py': encoder.encode(code)};
        iframe.contentWindow.postMessage({kind: 'flash', filesystem}, '*');
        this.setState({running: true, serial: ''});
    }

    /**
     * Wire conditional breakpoints for this run: the controller auto-continues
     * past a breakpoint whose condition is unmet. Reuses the SAME right-click
     * condition store (breakpoints.js) and parser (condition.js) as the 8051
     * debugger — lazy-loaded so a non-debug session never pulls the chunk.
     */
    _wireConditions () {
        Promise.all([
            import(/* webpackChunkName: "bw-debug" */ '../../lib/bw-debug/breakpoints.js'),
            import(/* webpackChunkName: "bw-debug" */ '../../lib/bw-debug/condition.js')
        ]).then(([bp, cond]) => {
            const conditionOf = bp.conditionOf || (() => null);
            const parse = cond.parseCondition;
            const cache = new Map();
            this._dbg.setConditionFn(blockId => {
                const src = conditionOf(blockId);
                if (!src) return null;
                if (cache.has(src)) return cache.get(src);
                let parsed = null;
                try { parsed = parse(src); } catch { parsed = null; }
                // parseCondition returns {error} on bad input — no test(); treat
                // as unconditional (halt), never as a silent skip.
                const usable = parsed && typeof parsed.test === 'function' ? parsed : null;
                cache.set(src, usable);
                return usable;
            });
        }).catch(() => { /* no bw-debug chunk -> plain breakpoints only */ });
    }

    /** Write a string to the program's serial-IN (the debug resume bytes). */
    _serialIn (text) {
        const iframe = this._iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;
        iframe.contentWindow.postMessage({kind: 'serial_input', data: String(text)}, '*');
    }

    _stop () {
        const iframe = this._iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;
        iframe.contentWindow.postMessage({kind: 'stop'}, '*');
        this._dbg.stop();
        this.setState({running: false});
    }

    _reset () {
        const iframe = this._iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;
        iframe.contentWindow.postMessage({kind: 'reset'}, '*');
        this._dbg.stop();
        this.setState({serial: '', running: true});
    }

    render () {
        const t = L10N[pickLocale()];
        const {dbg} = this.state;
        const btn = {
            padding: '4px 12px', borderRadius: 6, border: 'none',
            cursor: 'pointer', fontWeight: 600, fontSize: 12, color: '#fff'
        };
        // Inspector pane styles (the 8051-parity state view).
        const inspHead = {fontWeight: 700, color: '#475569', marginBottom: 4,
            textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: 10};
        const inspKey = {color: '#7c3aed', fontFamily: 'ui-monospace,Menlo,monospace',
            padding: '1px 6px 1px 0', verticalAlign: 'top', whiteSpace: 'nowrap'};
        const inspVal = {color: '#0f172a', fontFamily: 'ui-monospace,Menlo,monospace',
            padding: '1px 0', wordBreak: 'break-all'};
        const inspHint = {color: '#94a3b8', fontStyle: 'italic'};
        const inspBoardRow = {display: 'flex', flexWrap: 'wrap', gap: 3};
        const inspChip = {background: '#e2e8f0', color: '#334155', borderRadius: 4,
            padding: '1px 5px', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10};
        return (
            <div style={{display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc'}}
                data-testid="bw-microbit-sim-pane">
                {/* Simulator iframe */}
                <div style={{flex: '1 1 auto', minHeight: 200, position: 'relative'}}>
                    <iframe
                        ref={this._iframeRef}
                        src={SIM_URL}
                        title={t.simTitle}
                        data-testid="bw-microbit-iframe"
                        style={{
                            width: '100%', height: '100%', border: 'none',
                            background: '#fff', borderRadius: 8
                        }}
                        sandbox="allow-scripts allow-same-origin"
                    />
                </div>
                {/* Debug controls — only while a debug run is active. Step and
                    Continue are enabled only when the program is HALTED at a
                    breakpoint; otherwise the program is free-running and there
                    is nothing to resume. Block-level only, matching
                    capabilities().steps = ['block']. */}
                {dbg.active ? (
                    <div style={{display: 'flex', gap: 8, padding: '6px 8px', alignItems: 'center',
                        flexShrink: 0, background: '#fef3c7', borderTop: '1px solid #fcd34d'}}
                    data-testid="bw-microbit-debug-bar">
                        <button type="button" onClick={() => this._dbg.step()}
                            disabled={!dbg.halted}
                            style={{...btn, background: dbg.halted ? '#7c3aed' : '#c4b5fd'}}
                            data-testid="bw-microbit-debug-step">
                            {t.step}
                        </button>
                        <button type="button" onClick={() => this._dbg.cont()}
                            disabled={!dbg.halted}
                            style={{...btn, background: dbg.halted ? '#16a34a' : '#86efac'}}
                            data-testid="bw-microbit-debug-continue">
                            {t.continue}
                        </button>
                        <span style={{fontSize: 11, fontWeight: 700,
                            color: dbg.halted ? '#b45309' : '#166534'}}
                        data-testid="bw-microbit-debug-status">
                            {dbg.halted
                                ? `${t.pausedAt} #${dbg.index}`
                                : t.debugging}
                        </span>
                    </div>
                ) : null}
                {/* Inspector — the 8051-parity panes. Populated on halt from the
                    \x1eV/\x1eB state frames; the trace fills as the program steps.
                    Shown only during a debug run. */}
                {dbg.active ? (
                    <div style={{display: 'flex', gap: 0, flexShrink: 0, maxHeight: 150,
                        borderTop: '1px solid #e5e7eb', background: '#f8fafc', fontSize: 11}}
                    data-testid="bw-microbit-debug-inspector">
                        {/* Variables — the memory/register-equivalent pane. */}
                        <div style={{flex: '1 1 40%', overflow: 'auto', padding: '6px 8px',
                            borderRight: '1px solid #e5e7eb'}}
                        data-testid="bw-microbit-debug-vars">
                            <div style={inspHead}>{t.vars}</div>
                            {dbg.vars && Object.keys(dbg.vars).length ? (
                                <table style={{borderCollapse: 'collapse', width: '100%'}}>
                                    <tbody>
                                        {Object.keys(dbg.vars).map(k => (
                                            <tr key={k}>
                                                <td style={inspKey}>{k}</td>
                                                <td style={inspVal}>{JSON.stringify(dbg.vars[k])}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div style={inspHint}>{dbg.halted ? t.noVars : t.pauseToInspect}</div>
                            )}
                        </div>
                        {/* Board — the pin/sensor-status pane (micro:bit only). */}
                        <div style={{flex: '1 1 32%', overflow: 'auto', padding: '6px 8px',
                            borderRight: '1px solid #e5e7eb'}}
                        data-testid="bw-microbit-debug-board">
                            <div style={inspHead}>{t.board}</div>
                            {dbg.board ? (
                                <div>
                                    {Array.isArray(dbg.board.display) ? (
                                        <div style={{display: 'inline-grid',
                                            gridTemplateColumns: 'repeat(5, 9px)', gap: 2, marginBottom: 4}}>
                                            {dbg.board.display.map((row, y) => row.map((b, x) => (
                                                <div key={`${x}-${y}`} style={{width: 9, height: 9, borderRadius: 2,
                                                    background: `rgba(220,38,38,${Math.max(0, Math.min(9, b)) / 9})`,
                                                    outline: '1px solid #fecaca'}} />
                                            )))}
                                        </div>
                                    ) : null}
                                    <div style={inspBoardRow}>
                                        {'buttonA' in dbg.board ? <span style={inspChip}>A:{dbg.board.buttonA}</span> : null}
                                        {'buttonB' in dbg.board ? <span style={inspChip}>B:{dbg.board.buttonB}</span> : null}
                                        {'temp' in dbg.board ? <span style={inspChip}>{dbg.board.temp}°C</span> : null}
                                        {Array.isArray(dbg.board.accel)
                                            ? <span style={inspChip}>xyz:{dbg.board.accel.join(',')}</span> : null}
                                    </div>
                                </div>
                            ) : (
                                <div style={inspHint}>{dbg.halted ? '—' : t.pauseToInspect}</div>
                            )}
                        </div>
                        {/* Trace — the execution history (position markers, in order). */}
                        <div style={{flex: '1 1 28%', overflow: 'auto', padding: '6px 8px'}}
                        data-testid="bw-microbit-debug-trace">
                            <div style={inspHead}>{t.trace}</div>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: 3}}>
                                {dbg.trace.slice(-24).map((tr, i, a) => (
                                    <span key={i} style={{...inspChip,
                                        background: i === a.length - 1 ? '#7c3aed' : '#e2e8f0',
                                        color: i === a.length - 1 ? '#fff' : '#334155'}}>
                                        #{tr.n}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
                {/* Controls */}
                <div style={{display: 'flex', gap: 8, padding: '6px 8px', alignItems: 'center', flexShrink: 0}}>
                    <button type="button" onClick={() => this._stop()}
                        disabled={!this.state.running}
                        style={{...btn, background: this.state.running ? '#dc2626' : '#94a3b8'}}
                        data-testid="bw-microbit-stop">
                        {t.stop}
                    </button>
                    <button type="button" onClick={() => this._reset()}
                        style={{...btn, background: '#2563eb'}}
                        data-testid="bw-microbit-reset">
                        {t.reset}
                    </button>
                    <button type="button" onClick={() => this.setState({serial: ''})}
                        style={{...btn, background: '#6b7280'}}
                        data-testid="bw-microbit-clear-serial">
                        {t.clear}
                    </button>
                    <span style={{flex: 1}} />
                    <span style={{fontSize: 11, color: '#64748b'}}>
                        {this.state.simReady ? (this.state.running ? t.running : t.ready) : t.loading}
                    </span>
                </div>
                {/* Serial terminal */}
                <div style={{
                    flex: '0 0 auto', maxHeight: 160, minHeight: 60, overflow: 'auto',
                    padding: '6px 8px', background: '#1e293b', color: '#e2e8f0',
                    fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace',
                    fontSize: 12, lineHeight: 1.4, borderTop: '1px solid #334155',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                }}
                    data-testid="bw-microbit-serial">
                    {this.state.serial || t.serialPlaceholder}
                </div>
            </div>
        );
    }
}

MicrobitSimPane.propTypes = {
    vm: PropTypes.shape({runtime: PropTypes.object})
};

export default connect(state => ({
    vm: state.scratchGui.vm
}))(MicrobitSimPane);
