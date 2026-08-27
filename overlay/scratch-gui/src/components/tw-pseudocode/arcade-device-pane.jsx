import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';

const BUTTONS = {
    up: {label: '▲', key: 'ArrowUp'},
    down: {label: '▼', key: 'ArrowDown'},
    left: {label: '◀', key: 'ArrowLeft'},
    right: {label: '▶', key: 'ArrowRight'},
    a: {label: 'A', key: ' '},
    b: {label: 'B', key: 'z'},
    start: {label: 'START', key: 'Enter'},
    select: {label: 'SELECT', key: 'm'}
};

const buttonStyle = (kind, down) => ({
    appearance: 'none', WebkitAppearance: 'none', touchAction: 'none', userSelect: 'none',
    border: '2px solid rgba(255,255,255,.34)', color: '#fff', fontWeight: 800,
    background: down ? '#38bdf8' : (kind === 'action' ? '#e11d48' : '#172033'),
    boxShadow: down ? 'inset 0 2px 5px rgba(0,0,0,.5)' : '0 4px 0 #070b12',
    transform: down ? 'translateY(3px)' : 'none', cursor: 'pointer'
});

const ControlButton = ({button, kind, down, onDown, onUp, style}) => (
    <button
        aria-label={button}
        data-testid={`bw-arcade-${button}`}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onDown(button); }}
        onPointerUp={event => { event.preventDefault(); onUp(button); }}
        onPointerCancel={() => onUp(button)}
        style={{...buttonStyle(kind, down), ...style}}
        type="button"
    >{BUTTONS[button].label}</button>
);

ControlButton.propTypes = {
    button: PropTypes.oneOf(Object.keys(BUTTONS)).isRequired,
    down: PropTypes.bool.isRequired,
    kind: PropTypes.string,
    onDown: PropTypes.func.isRequired,
    onUp: PropTypes.func.isRequired,
    style: PropTypes.object
};

/**
 * A functional MakeCode Arcade / PyBadge console surface. The display mirrors
 * Scratch's 480x360 renderer into Arcade's 160x120 viewport; the extra four
 * rows above and below model the PyBadge's physical 160x128 TFT. Controls post
 * through Scratch's keyboard IO, so imported games and ordinary key blocks use
 * exactly the same input path.
 */
const ArcadeDevicePane = ({vm}) => {
    const canvasRef = React.useRef(null);
    const heldRef = React.useRef(new Set());
    const [held, setHeld] = React.useState({});
    const device = String(vm.runtime.bwDeviceId || vm.runtime.stc?.device || 'arcade').toLowerCase();
    const compact = device === 'pybadge-lc';
    const [light, setLight] = React.useState(50);
    const [tiltX, setTiltX] = React.useState(0);
    const [tiltY, setTiltY] = React.useState(0);
    const [, setRevision] = React.useState(0);

    const publishState = React.useCallback(next => {
        const previous = vm.runtime.bwArcadeDeviceState || {};
        vm.runtime.bwArcadeDeviceState = {
            buttons: {}, neopixels: Array(compact ? 1 : 5).fill('#111827'),
            battery: 100, light: 50, tiltX: 0, tiltY: 0,
            ...previous, ...next
        };
    }, [compact, vm]);

    const setButton = React.useCallback((name, isDown) => {
        if (isDown) heldRef.current.add(name); else heldRef.current.delete(name);
        const buttons = {};
        Object.keys(BUTTONS).forEach(key => { buttons[key] = heldRef.current.has(key); });
        setHeld(buttons);
        publishState({buttons});
        vm.postIOData('keyboard', {key: BUTTONS[name].key, isDown});
        if (isDown && vm.runtime.startHats) vm.runtime.startHats('arcade_whenButton', {BUTTON: name});
    }, [publishState, vm]);

    React.useEffect(() => {
        publishState({light, tiltX, tiltY});
    }, [light, publishState, tiltX, tiltY]);

    React.useEffect(() => {
        const changed = () => setRevision(value => value + 1);
        vm.runtime.on('ARCADE_DEVICE_CHANGED', changed);
        return () => vm.runtime.removeListener('ARCADE_DEVICE_CHANGED', changed);
    }, [vm]);

    React.useEffect(() => {
        let frame;
        const paint = () => {
            const destination = canvasRef.current;
            const source = vm.runtime.renderer && vm.runtime.renderer.canvas;
            if (destination && source) {
                const context = destination.getContext('2d');
                context.imageSmoothingEnabled = false;
                context.fillStyle = '#020617';
                context.fillRect(0, 0, 160, 128);
                context.drawImage(source, 0, 0, source.width, source.height, 0, 4, 160, 120);
            }
            frame = requestAnimationFrame(paint);
        };
        frame = requestAnimationFrame(paint);
        return () => {
            cancelAnimationFrame(frame);
            heldRef.current.forEach(name => vm.postIOData('keyboard', {key: BUTTONS[name].key, isDown: false}));
        };
    }, [vm]);

    const pixels = vm.runtime.bwArcadeDeviceState?.neopixels || [];
    const round = {width: 62, height: 62, borderRadius: '50%', fontSize: 24};
    const dpad = {position: 'absolute', width: 52, height: 52, borderRadius: 8, fontSize: 20};
    return (
        <div data-testid="bw-arcade-device" style={{height: '100%', minHeight: 620, overflow: 'auto', background: 'radial-gradient(circle at 50% 5%,#334155,#070b12 70%)', padding: '18px 12px', boxSizing: 'border-box', color: '#e2e8f0'}}>
            <div style={{maxWidth: 660, margin: '0 auto'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8}}>
                    <strong>{compact ? 'PyBadge LC' : device === 'microbit' ? 'micro:bit Arcade' : 'MakeCode Arcade · PyBadge'}</strong>
                    <small>160 × 120 game · 160 × 128 TFT</small>
                </div>
                <div style={{position: 'relative', borderRadius: 38, padding: '35px 42px 28px', background: 'linear-gradient(145deg,#5b21b6,#312e81)', border: '4px solid #8b5cf6', boxShadow: '0 14px 32px rgba(0,0,0,.5),inset 0 0 0 2px rgba(255,255,255,.13)'}}>
                    <div style={{display: 'flex', justifyContent: 'center', gap: 15, height: 14, marginTop: -23, marginBottom: 11}} aria-label="NeoPixels">
                        {Array.from({length: compact ? 1 : 5}, (_, index) => <span key={index} data-testid={`bw-arcade-pixel-${index}`} style={{width: 12, height: 12, borderRadius: '50%', background: pixels[index] || '#111827', border: '1px solid #fff8', boxShadow: `0 0 10px ${pixels[index] || 'transparent'}`}} />)}
                    </div>
                    <div style={{maxWidth: 512, margin: '0 auto', background: '#020617', padding: 12, borderRadius: 10, border: '3px solid #111827', boxShadow: 'inset 0 0 18px #000'}}>
                        <canvas ref={canvasRef} width="160" height="128" style={{display: 'block', width: '100%', aspectRatio: '5 / 4', imageRendering: 'pixelated', background: '#020617'}} />
                    </div>
                    <div style={{height: 220, position: 'relative', marginTop: 20}}>
                        <div style={{position: 'absolute', left: 8, top: 13, width: 164, height: 164}}>
                            <ControlButton button="up" down={Boolean(held.up)} onDown={name => setButton(name, true)} onUp={name => setButton(name, false)} style={{...dpad, left: 56, top: 0}} />
                            <ControlButton button="left" down={Boolean(held.left)} onDown={name => setButton(name, true)} onUp={name => setButton(name, false)} style={{...dpad, left: 0, top: 56}} />
                            <ControlButton button="right" down={Boolean(held.right)} onDown={name => setButton(name, true)} onUp={name => setButton(name, false)} style={{...dpad, left: 112, top: 56}} />
                            <ControlButton button="down" down={Boolean(held.down)} onDown={name => setButton(name, true)} onUp={name => setButton(name, false)} style={{...dpad, left: 56, top: 112}} />
                        </div>
                        <ControlButton button="b" kind="action" down={Boolean(held.b)} onDown={name => setButton(name, true)} onUp={name => setButton(name, false)} style={{...round, position: 'absolute', right: 85, top: 78}} />
                        <ControlButton button="a" kind="action" down={Boolean(held.a)} onDown={name => setButton(name, true)} onUp={name => setButton(name, false)} style={{...round, position: 'absolute', right: 8, top: 25}} />
                        <ControlButton button="select" down={Boolean(held.select)} onDown={name => setButton(name, true)} onUp={name => setButton(name, false)} style={{position: 'absolute', left: '38%', bottom: 0, width: 72, height: 28, borderRadius: 14, fontSize: 9}} />
                        <ControlButton button="start" down={Boolean(held.start)} onDown={name => setButton(name, true)} onUp={name => setButton(name, false)} style={{position: 'absolute', left: '54%', bottom: 0, width: 72, height: 28, borderRadius: 14, fontSize: 9}} />
                    </div>
                </div>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginTop: 14, padding: 12, borderRadius: 12, background: '#111827'}}>
                    <label>Light (A7): {light}<input aria-label="Light sensor" type="range" min="0" max="100" value={light} onChange={e => setLight(Number(e.target.value))} style={{width: '100%'}} /></label>
                    {!compact && <label>Tilt X: {tiltX}<input aria-label="Tilt X" type="range" min="-1024" max="1024" value={tiltX} onChange={e => setTiltX(Number(e.target.value))} style={{width: '100%'}} /></label>}
                    {!compact && <label>Tilt Y: {tiltY}<input aria-label="Tilt Y" type="range" min="-1024" max="1024" value={tiltY} onChange={e => setTiltY(Number(e.target.value))} style={{width: '100%'}} /></label>}
                </div>
            </div>
        </div>
    );
};

ArcadeDevicePane.propTypes = {vm: PropTypes.instanceOf(VM).isRequired};

export default ArcadeDevicePane;
