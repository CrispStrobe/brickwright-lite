import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';

import {
    gameTouchProfileFor,
    releaseTouchControls,
    setTouchControl
} from '../../lib/game-touch-controls.js';

const LABELS = {
    up: '▲', down: '▼', left: '◀', right: '▶', action: 'ACTION',
    leftUp: '▲', leftDown: '▼', rightUp: '▲', rightDown: '▼'
};

const TouchButton = ({control, down, label, onDown, onUp}) => (
    <button
        aria-label={`Game ${control}`}
        data-testid={`bw-game-control-${control}`}
        onContextMenu={event => event.preventDefault()}
        onPointerCancel={() => onUp(control)}
        onPointerDown={event => {
            event.preventDefault();
            if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
            onDown(control);
        }}
        onPointerUp={event => {
            event.preventDefault();
            onUp(control);
        }}
        style={{
            appearance: 'none', WebkitAppearance: 'none', touchAction: 'none', userSelect: 'none',
            minWidth: control === 'action' ? 72 : 44, height: 44, borderRadius: control === 'action' ? 22 : 10,
            border: '2px solid rgba(255,255,255,.45)', color: '#fff', fontWeight: 900,
            fontSize: control === 'action' ? 11 : 20, cursor: 'pointer',
            background: down ? '#38bdf8' : (control === 'action' ? '#e11d48' : '#172033'),
            boxShadow: down ? 'inset 0 2px 5px rgba(0,0,0,.5)' : '0 3px 0 #070b12',
            transform: down ? 'translateY(2px)' : 'none'
        }}
        type="button"
    >{label || LABELS[control]}</button>
);

TouchButton.propTypes = {
    control: PropTypes.oneOf(Object.keys(LABELS)).isRequired,
    down: PropTypes.bool.isRequired,
    label: PropTypes.string,
    onDown: PropTypes.func.isRequired,
    onUp: PropTypes.func.isRequired
};

const GameTouchControls = ({gameKey, vm}) => {
    const profile = React.useMemo(() => gameTouchProfileFor(gameKey), [gameKey]);
    const touchCapable = typeof navigator !== 'undefined' &&
        (navigator.maxTouchPoints > 0 ||
            (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
    const heldRef = React.useRef(new Set());
    const [held, setHeld] = React.useState({});

    const releaseAll = React.useCallback(() => {
        releaseTouchControls(vm, profile, heldRef.current);
        setHeld({});
    }, [profile, vm]);

    React.useEffect(() => {
        const releaseWhenHidden = () => {
            if (document.hidden) releaseAll();
        };
        window.addEventListener('blur', releaseAll);
        document.addEventListener('visibilitychange', releaseWhenHidden);
        return () => {
            window.removeEventListener('blur', releaseAll);
            document.removeEventListener('visibilitychange', releaseWhenHidden);
            releaseAll();
        };
    }, [releaseAll]);

    const setControl = React.useCallback((control, isDown) => {
        if (!setTouchControl(vm, profile, heldRef.current, control, isDown)) return;
        setHeld(Object.fromEntries([...heldRef.current].map(name => [name, true])));
    }, [profile, vm]);

    if (!profile || !touchCapable) return null;
    const button = control => <TouchButton
        control={control}
        down={Boolean(held[control])}
        key={control}
        label={control === 'action' ? profile.actionLabel : null}
        onDown={name => setControl(name, true)}
        onUp={name => setControl(name, false)}
    />;
    return (
        <div
            aria-label="Touch game controls"
            data-game-key={gameKey}
            data-testid="bw-game-touch-controls"
            style={{
                flex: '0 0 auto', padding: '7px 9px 9px', color: '#dbeafe', background: '#0f172a',
                borderTop: '1px solid #475569', touchAction: 'none', userSelect: 'none'
            }}
        >
            <div style={{fontSize: 11, textAlign: 'center', marginBottom: profile.layout === 'stage' ? 0 : 6}}>
                {profile.hint}
            </div>
            {profile.layout === 'dpad' ? (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8}}>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3,44px)', gridTemplateRows: 'repeat(2,44px)', gap: 4}}>
                        <span />{button('up')}<span />
                        {button('left')}{button('down')}{button('right')}
                    </div>
                    {button('action')}
                </div>
            ) : null}
            {profile.layout === 'dual' ? (
                <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16}}>
                    <div style={{display: 'flex', gap: 6, alignItems: 'center'}}><strong style={{fontSize: 10}}>CYAN</strong>{button('leftUp')}{button('leftDown')}</div>
                    <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>{button('rightUp')}{button('rightDown')}<strong style={{fontSize: 10}}>GOLD</strong></div>
                </div>
            ) : null}
            {profile.layout === 'vertical' ? (
                <div style={{display: 'flex', justifyContent: 'center', gap: 8}}>
                    {button('up')}{button('down')}
                </div>
            ) : null}
            {profile.layout === 'action' || profile.layout === 'stage-action' ? (
                <div style={{display: 'flex', justifyContent: 'center'}}>{button('action')}</div>
            ) : null}
        </div>
    );
};

GameTouchControls.propTypes = {
    gameKey: PropTypes.string.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default GameTouchControls;
