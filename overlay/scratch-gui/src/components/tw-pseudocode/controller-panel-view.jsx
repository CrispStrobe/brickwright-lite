import React from 'react';
import { ControllerPanel, WIDGET_TYPES } from '../../lib/bw-board/controller.js';
import { bindPanelToBoard } from '../../lib/bw-board/controller-binding.js';

const L10N = {
    en: {
        title: 'Controller',
        edit: 'Edit', play: 'Play',
        addWidget: '+ Add Widget',
        joystick: 'Joystick', button: 'Button', slider: 'Slider',
        dpad: 'D-Pad', dial: 'Dial',
        bindPart: 'Bind to part…', bindProgram: 'Program only',
        unbind: 'Unbind', remove: 'Remove',
        namePlaceholder: 'name',
        noWidgets: 'No widgets yet. Click "+ Add Widget" to begin.',
        x: 'X', y: 'Y',
    },
    de: {
        title: 'Controller',
        edit: 'Bearbeiten', play: 'Spielen',
        addWidget: '+ Widget hinzufügen',
        joystick: 'Joystick', button: 'Taste', slider: 'Schieberegler',
        dpad: 'Steuerkreuz', dial: 'Drehregler',
        bindPart: 'An Bauteil binden…', bindProgram: 'Nur Programm',
        unbind: 'Lösen', remove: 'Entfernen',
        namePlaceholder: 'Name',
        noWidgets: 'Noch keine Widgets. Klicke auf „+ Widget hinzufügen".',
        x: 'X', y: 'Y',
    }
};
const pickLocale = () => { try { return /^de/i.test(navigator.language) ? 'de' : 'en'; } catch { return 'en'; } };
const t = key => (L10N[pickLocale()] || L10N.en)[key] || L10N.en[key] || key;

// ─── Joystick widget ─────────────────────────────────────────────────────

const KNOB_RADIUS = 18;
const PAD_RADIUS = 50;

class JoystickWidget extends React.Component {
    constructor(props) {
        super(props);
        this.state = { dragging: false };
        this._padRef = React.createRef();
        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
    }

    _getRelative(e) {
        const rect = this._padRef.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = e.clientX - cx;
        let dy = e.clientY - cy;
        const maxR = rect.width / 2 - KNOB_RADIUS;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxR) { dx = dx / dist * maxR; dy = dy / dist * maxR; }
        // Map to -100..100
        const x = Math.round(dx / maxR * 100);
        const y = Math.round(-dy / maxR * 100); // Y up is positive
        return { x, y, px: dx, py: dy };
    }

    _onPointerDown(e) {
        if (this.props.mode !== 'play') return;
        e.preventDefault();
        e.target.setPointerCapture(e.pointerId);
        this.setState({ dragging: true });
        const { x, y } = this._getRelative(e);
        this.props.onInput(this.props.name, x, y);
    }

    _onPointerMove(e) {
        if (!this.state.dragging) return;
        const { x, y } = this._getRelative(e);
        this.props.onInput(this.props.name, x, y);
    }

    _onPointerUp(e) {
        if (!this.state.dragging) return;
        this.setState({ dragging: false });
        // Spring back to center
        this.props.onInput(this.props.name, 0, 0);
    }

    render() {
        const { widget, mode } = this.props;
        const { x = 0, y = 0 } = widget.state;
        const maxR = PAD_RADIUS - KNOB_RADIUS;
        const knobX = x / 100 * maxR;
        const knobY = -y / 100 * maxR; // screen Y is inverted
        const playable = mode === 'play';
        return (
            <div
                ref={this._padRef}
                style={{
                    width: PAD_RADIUS * 2,
                    height: PAD_RADIUS * 2,
                    borderRadius: '50%',
                    background: playable ? '#e2e8f0' : '#f1f5f9',
                    border: '2px solid #94a3b8',
                    position: 'relative',
                    cursor: playable ? 'pointer' : 'default',
                    touchAction: 'none',
                    userSelect: 'none',
                }}
                onPointerDown={this._onPointerDown}
                onPointerMove={this._onPointerMove}
                onPointerUp={this._onPointerUp}
            >
                {/* Crosshair */}
                <div style={{
                    position: 'absolute', left: '50%', top: 0, bottom: 0,
                    width: 1, background: '#cbd5e1', transform: 'translateX(-0.5px)'
                }} />
                <div style={{
                    position: 'absolute', top: '50%', left: 0, right: 0,
                    height: 1, background: '#cbd5e1', transform: 'translateY(-0.5px)'
                }} />
                {/* Knob */}
                <div style={{
                    position: 'absolute',
                    left: PAD_RADIUS + knobX - KNOB_RADIUS,
                    top: PAD_RADIUS + knobY - KNOB_RADIUS,
                    width: KNOB_RADIUS * 2,
                    height: KNOB_RADIUS * 2,
                    borderRadius: '50%',
                    background: this.state.dragging ? '#7C3AED' : '#6366f1',
                    border: '2px solid #4f46e5',
                    transition: this.state.dragging ? 'none' : 'left 0.15s, top 0.15s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                }} />
                {/* Value readout */}
                <div style={{
                    position: 'absolute', bottom: -22, left: 0, right: 0,
                    textAlign: 'center', fontSize: 11, color: '#64748b', fontFamily: 'monospace'
                }}>
                    {t('x')}:{x} {t('y')}:{y}
                </div>
            </div>
        );
    }
}

// ─── D-pad widget ─────────────────────────────────────────────────────────

const DPAD_SIZE = 120;
const DPAD_BTN = 36;

function DpadWidget({ widget, name, mode, panel }) {
    const playable = mode === 'play';
    const { up = false, down = false, left = false, right = false } = widget.state;
    const dirs = [
        { key: 'up',    label: '▲', x: (DPAD_SIZE - DPAD_BTN) / 2, y: 0 },
        { key: 'down',  label: '▼', x: (DPAD_SIZE - DPAD_BTN) / 2, y: DPAD_SIZE - DPAD_BTN },
        { key: 'left',  label: '◄', x: 0, y: (DPAD_SIZE - DPAD_BTN) / 2 },
        { key: 'right', label: '►', x: DPAD_SIZE - DPAD_BTN, y: (DPAD_SIZE - DPAD_BTN) / 2 },
    ];
    const pressed = { up, down, left, right };
    return (
        <div style={{
            width: DPAD_SIZE, height: DPAD_SIZE,
            position: 'relative', userSelect: 'none',
        }}>
            {/* Center cross background */}
            <div style={{
                position: 'absolute',
                left: (DPAD_SIZE - DPAD_BTN) / 2, top: 0,
                width: DPAD_BTN, height: DPAD_SIZE,
                background: '#e2e8f0', borderRadius: 6,
            }} />
            <div style={{
                position: 'absolute',
                left: 0, top: (DPAD_SIZE - DPAD_BTN) / 2,
                width: DPAD_SIZE, height: DPAD_BTN,
                background: '#e2e8f0', borderRadius: 6,
            }} />
            {dirs.map(d => (
                <button
                    key={d.key}
                    disabled={!playable}
                    onPointerDown={() => panel.setDpadInput(name, d.key, true)}
                    onPointerUp={() => panel.setDpadInput(name, d.key, false)}
                    onPointerLeave={() => { if (pressed[d.key]) panel.setDpadInput(name, d.key, false); }}
                    style={{
                        position: 'absolute', left: d.x, top: d.y,
                        width: DPAD_BTN, height: DPAD_BTN,
                        border: 'none', borderRadius: 6,
                        background: pressed[d.key] ? '#7C3AED' : '#cbd5e1',
                        color: pressed[d.key] ? '#fff' : '#334155',
                        fontSize: 16, fontWeight: 700,
                        cursor: playable ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.1s',
                    }}
                >
                    {d.label}
                </button>
            ))}
            {/* Readout */}
            <div style={{
                position: 'absolute', bottom: -20, left: 0, right: 0,
                textAlign: 'center', fontSize: 11, color: '#64748b', fontFamily: 'monospace'
            }}>
                {up ? '↑' : ''}{down ? '↓' : ''}{left ? '←' : ''}{right ? '→' : ''}{(!up && !down && !left && !right) ? '·' : ''}
            </div>
        </div>
    );
}

// ─── Matrix display face ──────────────────────────────────────────────────
// Read-only: a rows×cols grid of dots lit from the widget's bitmask state
// (bit r*cols+c). The program writes a bound variable; bindPanelToVariables
// pumps it into panel.setMatrixValue; the panel event re-renders this face.

function MatrixWidget({ widget }) {
    const rows = widget.config.rows | 0 || 5;
    const cols = widget.config.cols | 0 || 5;
    const bits = Number(widget.state.value) || 0;
    const dots = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const lit = (bits >>> (r * cols + c)) & 1;
            dots.push(
                <div key={`${r}-${c}`}
                    data-lit={lit ? '1' : '0'}
                    style={{
                        width: 12, height: 12, borderRadius: 3,
                        background: lit ? '#ef4444' : '#e2e8f0',
                        boxShadow: lit ? '0 0 6px rgba(239,68,68,0.7)' : 'none',
                        transition: 'background 80ms'
                    }}
                />
            );
        }
    }
    return (
        <div data-testid={`bw-ctl-matrix-${widget.name}`}
            style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 12px)`,
                gap: 3, padding: 8,
                background: '#1e293b', borderRadius: 8
            }}>
            {dots}
        </div>
    );
}

// ─── Seven-segment display face ───────────────────────────────────────────
// Read-only numeric face: the bound variable's value, truncated to integer,
// right-aligned across config.digits tubes; dashes when it does not fit.
// Classic segment layout per tube (a top, g middle, dp omitted).

const SEVENSEG_FONT = {
    '0': 0x3F, '1': 0x06, '2': 0x5B, '3': 0x4F, '4': 0x66,
    '5': 0x6D, '6': 0x7D, '7': 0x07, '8': 0x7F, '9': 0x6F,
    '-': 0x40, ' ': 0x00
};

function SevenSegDigit({ bits }) {
    // segment geometry inside a 22x36 tube: a,b,c,d,e,f,g (bit 0..6)
    const on = (i) => (bits >> i) & 1;
    const seg = (lit, style) => (
        <div style={{
            position: 'absolute', background: lit ? '#f87171' : '#374151',
            boxShadow: lit ? '0 0 4px rgba(248,113,113,0.8)' : 'none',
            borderRadius: 2, ...style
        }} />
    );
    return (
        <div style={{ position: 'relative', width: 22, height: 36 }}>
            {seg(on(0), { left: 4, top: 0, width: 14, height: 4 })}
            {seg(on(1), { right: 0, top: 3, width: 4, height: 13 })}
            {seg(on(2), { right: 0, bottom: 3, width: 4, height: 13 })}
            {seg(on(3), { left: 4, bottom: 0, width: 14, height: 4 })}
            {seg(on(4), { left: 0, bottom: 3, width: 4, height: 13 })}
            {seg(on(5), { left: 0, top: 3, width: 4, height: 13 })}
            {seg(on(6), { left: 4, top: 16, width: 14, height: 4 })}
        </div>
    );
}

function SevenSegWidget({ widget }) {
    const digits = (widget.config.digits | 0) || 4;
    const raw = Math.trunc(Number(widget.state.value) || 0);
    const neg = raw < 0;
    let text = String(Math.abs(raw));
    let shown;
    if (text.length + (neg ? 1 : 0) > digits) shown = '-'.repeat(digits);
    else shown = ((neg ? '-' : '') + text).padStart(digits, ' ');
    return (
        <div data-testid={`bw-ctl-sevenseg-${widget.name}`} data-shown={shown}
            style={{
                display: 'flex', gap: 4, padding: '8px 10px',
                background: '#111827', borderRadius: 8
            }}>
            {shown.split('').map((ch, i) => (
                <SevenSegDigit key={i} bits={SEVENSEG_FONT[ch] ?? 0x40} />
            ))}
        </div>
    );
}

// ─── Widget card (edit mode wrapper) ──────────────────────────────────────

function WidgetCard({ widget, mode, panel, onInput, onRemove, onBindPart }) {
    const typeLabels = {
        joystick: t('joystick'), button: t('button'), slider: t('slider'),
        dpad: t('dpad'), dial: t('dial'), gauge: 'Gauge', matrix: 'Matrix', sevenseg: '7-Seg'
    };
    const bindingLabel = widget.binding
        ? (widget.binding.target === 'part'
            ? `→ ${widget.binding.partId}${widget.binding.param ? '.' + widget.binding.param : ''}`
            : t('bindProgram'))
        : '—';

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 12,
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            position: 'relative',
            minWidth: 130,
        }}>
            <div style={{
                fontWeight: 600, fontSize: 13, color: '#334155',
                display: 'flex', alignItems: 'center', gap: 6
            }}>
                <span style={{
                    background: '#7C3AED', color: '#fff', borderRadius: 4,
                    padding: '1px 6px', fontSize: 10, textTransform: 'uppercase'
                }}>
                    {typeLabels[widget.type] || widget.type}
                </span>
                {widget.name}
            </div>

            {widget.type === 'joystick' && (
                <JoystickWidget
                    widget={widget}
                    name={widget.name}
                    mode={mode}
                    onInput={onInput}
                />
            )}

            {widget.type === 'dpad' && (
                <DpadWidget
                    widget={widget}
                    name={widget.name}
                    mode={mode}
                    panel={panel}
                />
            )}

            {widget.type === 'slider' && (
                <div style={{ width: '100%', padding: '0 4px' }}>
                    <input
                        type="range"
                        min={widget.config.min}
                        max={widget.config.max}
                        step={widget.config.step}
                        value={widget.state.value}
                        disabled={mode !== 'play'}
                        onChange={e => {
                            panel.setSliderInput(widget.name, Number(e.target.value));
                        }}
                        style={{ width: '100%' }}
                    />
                    <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                        {widget.state.value}
                    </div>
                </div>
            )}

            {widget.type === 'button' && (
                <button
                    disabled={mode !== 'play'}
                    onPointerDown={() => panel.setButtonInput(widget.name, true)}
                    onPointerUp={() => panel.setButtonInput(widget.name, false)}
                    onPointerLeave={() => {
                        if (!widget.config.toggle) panel.setButtonInput(widget.name, false);
                    }}
                    style={{
                        width: 56, height: 56, borderRadius: '50%',
                        border: '2px solid #4f46e5',
                        background: widget.state.pressed ? '#7C3AED' : '#e2e8f0',
                        color: widget.state.pressed ? '#fff' : '#334155',
                        fontWeight: 700, fontSize: 14,
                        cursor: mode === 'play' ? 'pointer' : 'default',
                    }}
                >
                    {widget.config.toggle ? (widget.state.pressed ? 'ON' : 'OFF') : '●'}
                </button>
            )}

            {widget.type === 'dial' && (
                <div style={{ width: '100%', padding: '0 4px' }}>
                    <input
                        type="range"
                        min={widget.config.min}
                        max={widget.config.max}
                        value={widget.state.value}
                        disabled={mode !== 'play'}
                        onChange={e => panel.setSliderInput(widget.name, Number(e.target.value))}
                        style={{ width: '100%' }}
                    />
                    <div style={{ textAlign: 'center', fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                        {widget.state.value}°
                    </div>
                </div>
            )}

            {widget.type === 'matrix' && (
                <MatrixWidget widget={widget} />
            )}

            {widget.type === 'sevenseg' && (
                <SevenSegWidget widget={widget} />
            )}

            {mode === 'edit' && (
                <div style={{ display: 'flex', gap: 4, fontSize: 11 }}>
                    <button
                        onClick={onRemove}
                        style={{
                            background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5',
                            borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11
                        }}
                    >
                        {t('remove')}
                    </button>
                </div>
            )}

            <div style={{ fontSize: 10, color: '#94a3b8' }}>
                {bindingLabel}
            </div>
        </div>
    );
}

// ─── Main panel view ──────────────────────────────────────────────────────

class ControllerPanelView extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            addMenuOpen: false,
            revision: 0,    // bump to force re-render on panel events
        };
        this._onPanelEvent = this._onPanelEvent.bind(this);
        this._binding = null;
    }

    componentDidMount() {
        const panel = this._getPanel();
        panel.addListener(this._onPanelEvent);
        // Expose panel on runtime for the extension to find
        this._exposeOnRuntime(panel);
        // If entering in play mode and board exists, bind
        if (panel.mode === 'play' && this.props.board) {
            this._bindToBoard(panel);
        }
    }

    componentWillUnmount() {
        const panel = this._getPanel();
        panel.removeListener(this._onPanelEvent);
        this._unbind();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.board !== this.props.board) {
            const panel = this._getPanel();
            if (panel.mode === 'play' && this.props.board) {
                this._bindToBoard(panel);
            }
        }
    }

    _getPanel() {
        return this.props.panel;
    }

    _exposeOnRuntime(panel) {
        // Make the panel accessible to the ControllerExtension via vm.runtime.controllerPanel
        if (this.props.vm && this.props.vm.runtime) {
            this.props.vm.runtime.controllerPanel = panel;
        }
    }

    _onPanelEvent() {
        this.setState(s => ({ revision: s.revision + 1 }));
    }

    _bindToBoard(panel) {
        this._unbind();
        if (this.props.board) {
            this._binding = bindPanelToBoard(panel, this.props.board);
            this._binding.sync();
        }
    }

    _unbind() {
        if (this._binding) {
            this._binding.dispose();
            this._binding = null;
        }
    }

    _setMode(mode) {
        const panel = this._getPanel();
        panel.setMode(mode);
        if (mode === 'play') {
            this._bindToBoard(panel);
        } else {
            this._unbind();
        }
    }

    _addWidget(type) {
        const panel = this._getPanel();
        // Generate a unique name
        const existing = panel.getWidgetNames();
        const typeLabels = { joystick: 'joy', button: 'btn', slider: 'slider', dpad: 'dpad', dial: 'dial' };
        const prefix = typeLabels[type] || type;
        let idx = 1;
        while (existing.includes(`${prefix}${idx}`)) idx++;
        const name = `${prefix}${idx}`;
        panel.addWidget(name, type);
        // Default binding: program-facing
        panel.bindToProgram(name);
        this.setState({ addMenuOpen: false });
        // Persist immediately
        this._persist();
    }

    _removeWidget(name) {
        this._getPanel().removeWidget(name);
        this._persist();
    }

    _persist() {
        // Emit a persistence event so the host knows to save
        window.dispatchEvent(new CustomEvent('bw-controller-changed', {
            detail: { data: this._getPanel().toJSON() }
        }));
    }

    _handleJoystickInput(name, x, y) {
        this._getPanel().setJoystickInput(name, x, y);
    }

    render() {
        const panel = this._getPanel();
        const mode = panel.mode;
        const widgets = panel.getWidgets();

        return (
            <div style={{
                position: 'absolute', inset: 0,
                background: '#f8fafc',
                display: 'flex', flexDirection: 'column',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                overflow: 'hidden',
                zIndex: 10,
            }}>
                {/* Toolbar */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px',
                    borderBottom: '1px solid #e2e8f0',
                    background: '#fff',
                    flexShrink: 0,
                }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#7C3AED' }}>
                        {t('title')}
                    </span>
                    <div style={{ flex: 1 }} />
                    {/* Mode toggle */}
                    <div style={{
                        display: 'flex', borderRadius: 6,
                        border: '1px solid #cbd5e1', overflow: 'hidden'
                    }}>
                        <button
                            onClick={() => this._setMode('edit')}
                            style={{
                                padding: '4px 12px', fontSize: 12, border: 'none',
                                cursor: 'pointer', fontWeight: 600,
                                background: mode === 'edit' ? '#7C3AED' : '#f1f5f9',
                                color: mode === 'edit' ? '#fff' : '#64748b',
                            }}
                        >
                            {t('edit')}
                        </button>
                        <button
                            onClick={() => this._setMode('play')}
                            style={{
                                padding: '4px 12px', fontSize: 12, border: 'none',
                                cursor: 'pointer', fontWeight: 600,
                                background: mode === 'play' ? '#7C3AED' : '#f1f5f9',
                                color: mode === 'play' ? '#fff' : '#64748b',
                            }}
                        >
                            {t('play')}
                        </button>
                    </div>
                    {/* Add widget (edit mode only) */}
                    {mode === 'edit' && (
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => this.setState(s => ({ addMenuOpen: !s.addMenuOpen }))}
                                style={{
                                    background: '#7C3AED', color: '#fff', border: 'none',
                                    borderRadius: 6, padding: '4px 12px', fontSize: 12,
                                    cursor: 'pointer', fontWeight: 600,
                                }}
                            >
                                {t('addWidget')}
                            </button>
                            {this.state.addMenuOpen && (
                                <div style={{
                                    position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                    background: '#fff', border: '1px solid #e2e8f0',
                                    borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    padding: 4, zIndex: 100, minWidth: 120,
                                }}>
                                    {Object.values(WIDGET_TYPES).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => this._addWidget(type)}
                                            style={{
                                                display: 'block', width: '100%', textAlign: 'left',
                                                padding: '6px 10px', border: 'none', background: 'none',
                                                cursor: 'pointer', fontSize: 12, borderRadius: 4,
                                                color: '#334155',
                                            }}
                                            onMouseOver={e => e.target.style.background = '#f1f5f9'}
                                            onMouseOut={e => e.target.style.background = 'none'}
                                        >
                                            {t(type)}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Widget area */}
                <div style={{
                    flex: 1, overflow: 'auto', padding: 16,
                    display: 'flex', flexWrap: 'wrap', gap: 16,
                    alignContent: 'flex-start', justifyContent: 'center',
                }}>
                    {widgets.length === 0 && (
                        <div style={{
                            color: '#94a3b8', fontSize: 14, textAlign: 'center',
                            padding: '40px 20px',
                        }}>
                            {t('noWidgets')}
                        </div>
                    )}
                    {widgets.map(w => (
                        <WidgetCard
                            key={w.name}
                            widget={w}
                            mode={mode}
                            panel={panel}
                            onInput={(name, x, y) => this._handleJoystickInput(name, x, y)}
                            onRemove={() => this._removeWidget(w.name)}
                        />
                    ))}
                </div>
            </div>
        );
    }
}

export default ControllerPanelView;
