import PropTypes from 'prop-types';
import React from 'react';
import {makeT, browserLocale} from '../../lib/bw-i18n.js';

// Our component, so a local table rather than react-intl — see lib/bw-i18n.js.
const L10N = {
    en: {
        ring: 'NeoPixel ring',
        buttons: 'Buttons',
        slideSwitch: 'Slide switch',
        left: 'left',
        right: 'right',
        touch: 'Touch pads',
        light: 'Light',
        temperature: 'Temperature (°C)',
        sound: 'Sound level',
        tiltX: 'Tilt X (mg)',
        tiltY: 'Tilt Y (mg)',
        gestures: 'Gestures',
        speaker: 'Speaker',
        silent: 'silent',
        loading: 'Loading the Circuit Playground blocks…'
    },
    de: {
        ring: 'NeoPixel-Ring',
        buttons: 'Tasten',
        slideSwitch: 'Schiebeschalter',
        left: 'links',
        right: 'rechts',
        touch: 'Berührungsfelder',
        light: 'Licht',
        temperature: 'Temperatur (°C)',
        sound: 'Lautstärke',
        tiltX: 'Neigung X (mg)',
        tiltY: 'Neigung Y (mg)',
        gestures: 'Gesten',
        speaker: 'Lautsprecher',
        silent: 'still',
        loading: 'Circuit-Playground-Blöcke werden geladen…'
    }
};
const t = key => makeT(L10N)(browserLocale(), key);

const PADS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'];
// The extension's gesture menu values (MakeCode's identifiers) and their labels.
const GESTURES = [['shake', 'shake'], ['tiltLeft', 'tilt left'], ['tiltRight', 'tilt right'],
    ['tiltUp', 'tilt up'], ['tiltDown', 'tilt down'], ['faceUp', 'face up'], ['faceDown', 'face down'],
    ['freeFall', 'free fall']];

// What the ring emits is each channel scaled by the strip brightness (16 of
// 255 at start, as pxt-adafruit). Drawn linearly that is near black; an LED
// looks brighter than its duty cycle, so the pane shows it through the usual
// gamma 2.2 perceptual curve instead of inventing a brightness.
const perceived = rgb => {
    const g = c => Math.round(255 * Math.pow(c / 255, 1 / 2.2));
    return `rgb(${g((rgb >> 16) & 0xff)}, ${g((rgb >> 8) & 0xff)}, ${g(rgb & 0xff)})`;
};

const pressStyle = down => ({
    appearance: 'none', touchAction: 'none', userSelect: 'none', cursor: 'pointer',
    minWidth: 40, height: 40, borderRadius: 20, fontWeight: 800,
    border: '2px solid #3b0a2b', color: '#fff',
    background: down ? '#f472b6' : '#2a2a35',
    boxShadow: down ? 'inset 0 2px 5px rgba(0,0,0,.5)' : '0 3px 0 #111'
});

const PressButton = ({label, testId, down, onChange}) => (
    <button
        aria-label={label}
        aria-pressed={down}
        data-testid={testId}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onChange(true);
        }}
        onPointerUp={event => { event.preventDefault(); onChange(false); }}
        onPointerCancel={() => onChange(false)}
        style={pressStyle(down)}
        type="button"
    >{label}</button>
);

PressButton.propTypes = {
    down: PropTypes.bool.isRequired,
    label: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    testId: PropTypes.string.isRequired
};

const Slider = ({label, testId, min, max, value, onChange}) => (
    <label style={{display: 'grid', gridTemplateColumns: '9em 1fr 3.5em', gap: 8, alignItems: 'center'}}>
        <span>{label}</span>
        <input
            aria-label={label}
            data-testid={testId}
            max={max}
            min={min}
            onChange={event => onChange(Number(event.target.value))}
            type="range"
            value={value}
        />
        <span style={{textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>{value}</span>
    </label>
);

Slider.propTypes = {
    label: PropTypes.string.isRequired,
    max: PropTypes.number.isRequired,
    min: PropTypes.number.isRequired,
    onChange: PropTypes.func.isRequired,
    testId: PropTypes.string.isRequired,
    value: PropTypes.number.isRequired
};

/**
 * The Circuit Playground Express board (task A9): the ten-pixel ring as the
 * `circuitplayground` extension publishes it (runtime.bwCpxState, CPX_STATE),
 * and the board's inputs driven through the extension's own API
 * (runtime.bwCpx), which starts the matching hats. The pane holds no board
 * behaviour of its own: thresholds, click timing and the ring's brightness
 * are the extension's, so what this shows is what a program reads.
 */
const CpxDevicePane = ({vm}) => {
    const runtime = vm.runtime;
    const [board, setBoard] = React.useState(() => runtime.bwCpx || null);
    const [state, setState] = React.useState(() => runtime.bwCpxState || null);

    React.useEffect(() => {
        const changed = next => {
            setState(next);
            if (!board && runtime.bwCpx) setBoard(runtime.bwCpx);
        };
        runtime.on('CPX_STATE', changed);
        // A pane opened before the program loaded the extension loads it, so
        // the board exists to be driven.
        if (!runtime.bwCpx && vm.extensionManager && !vm.extensionManager.isExtensionLoaded('circuitplayground')) {
            Promise.resolve(vm.extensionManager.loadExtensionURL('circuitplayground')).then(() => {
                setBoard(runtime.bwCpx || null);
                setState(runtime.bwCpxState || null);
            }, () => {});
        }
        return () => runtime.removeListener('CPX_STATE', changed);
    }, [board, runtime, vm]);

    if (!board || !state) return <div style={{padding: 24, color: '#64748b'}}>{t('loading')}</div>;

    const accel = state.accel || {x: 0, y: 0, z: -1023};
    const ring = (state.shown || []).map((rgb, i) => {
        const angle = (2 * Math.PI * i) / 10;
        return (
            <circle
                cx={100 + (70 * Math.sin(angle))}
                cy={100 - (70 * Math.cos(angle))}
                data-testid={`bw-cpx-pixel-${i}`}
                fill={perceived(rgb)}
                key={i}
                r={12}
                stroke="#3b0a2b"
                strokeWidth={2}
            />
        );
    });

    return (
        <div
            data-testid="bw-cpx-pane"
            style={{display: 'flex', flexDirection: 'column', gap: 14, padding: 16, height: '100%',
                overflow: 'auto', background: '#16121b', color: '#f5f3f7', fontSize: 13}}
        >
            <svg aria-label={t('ring')} role="img" style={{alignSelf: 'center'}} viewBox="0 0 200 200" width={220}>
                <circle cx={100} cy={100} fill="#c0168c" r={95} />
                <circle cx={100} cy={100} fill="#860f65" r={34} />
                {ring}
            </svg>
            <div style={{display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center'}}>
                <span>{t('buttons')}</span>
                {['A', 'B'].map(name => (
                    <PressButton
                        down={Boolean(state.buttons && state.buttons[name])}
                        key={name}
                        label={name}
                        onChange={down => board.setButton(name, down)}
                        testId={`bw-cpx-button-${name}`}
                    />
                ))}
                <button
                    aria-label={t('slideSwitch')}
                    aria-pressed={Boolean(state.switchRight)}
                    data-testid="bw-cpx-switch"
                    onClick={() => board.setSwitch(!state.switchRight)}
                    style={{...pressStyle(false), borderRadius: 8, padding: '0 10px'}}
                    type="button"
                >{t('slideSwitch')}: {state.switchRight ? t('right') : t('left')}</button>
            </div>
            <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center'}}>
                <span>{t('touch')}</span>
                {PADS.map(pad => (
                    <PressButton
                        down={Boolean(state.buttons && state.buttons[pad])}
                        key={pad}
                        label={pad}
                        onChange={down => board.setButton(pad, down)}
                        testId={`bw-cpx-touch-${pad}`}
                    />
                ))}
            </div>
            <Slider
                label={t('light')}
                max={255}
                min={0}
                onChange={v => board.setLightLevel(v)}
                testId="bw-cpx-light"
                value={state.lightLevel}
            />
            <Slider
                label={t('temperature')}
                max={50}
                min={-5}
                onChange={v => board.setTemperature(v)}
                testId="bw-cpx-temperature"
                value={state.temperature}
            />
            <Slider
                label={t('sound')}
                max={255}
                min={0}
                onChange={v => board.setSoundLevel(v)}
                testId="bw-cpx-sound"
                value={state.soundLevel}
            />
            <Slider
                label={t('tiltX')}
                max={1023}
                min={-1023}
                onChange={v => board.setAcceleration(v, accel.y, accel.z)}
                testId="bw-cpx-tilt-x"
                value={accel.x}
            />
            <Slider
                label={t('tiltY')}
                max={1023}
                min={-1023}
                onChange={v => board.setAcceleration(accel.x, v, accel.z)}
                testId="bw-cpx-tilt-y"
                value={accel.y}
            />
            <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center'}}>
                <span>{t('gestures')}</span>
                {GESTURES.map(([value, label]) => (
                    <button
                        data-testid={`bw-cpx-gesture-${value}`}
                        key={value}
                        onClick={() => board.gesture(value)}
                        style={{...pressStyle(false), borderRadius: 8, height: 30, padding: '0 8px', fontWeight: 600}}
                        type="button"
                    >{label}</button>
                ))}
            </div>
            <div data-testid="bw-cpx-speaker">
                {t('speaker')}: {state.tone ? `${state.tone} Hz` : t('silent')}
            </div>
        </div>
    );
};

CpxDevicePane.propTypes = {
    vm: PropTypes.shape({
        extensionManager: PropTypes.object,
        runtime: PropTypes.object.isRequired
    }).isRequired
};

export default CpxDevicePane;
