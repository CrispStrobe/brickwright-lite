// SPDX-License-Identifier: BSD-3-Clause
import React from 'react';
import {createBrickButtonInputs} from '../../lib/bw-sim/api/brick-button-inputs.js';

const TEXT = {
    en: {title: 'Brick buttons', hint: 'Hold a button with the pointer, Space or Enter.',
        up: 'Up', enter: 'Enter', down: 'Down', right: 'Right', left: 'Left', back: 'Back', exit: 'Exit',
        center: 'Center', bluetooth: 'Bluetooth', button: 'Button'},
    de: {title: 'Tasten am Hub', hint: 'Taste mit Maus, Leertaste oder Eingabetaste gedrückt halten.',
        up: 'Hoch', enter: 'Eingabe', down: 'Runter', right: 'Rechts', left: 'Links', back: 'Zurück', exit: 'Beenden',
        center: 'Mitte', bluetooth: 'Bluetooth', button: 'Taste'}
};
const keyOf = (hub, button, key) => JSON.stringify(['keyboard', hub, button, key]);
const buttonStyle = {border: '1px solid #94a3b8', borderRadius: 5, padding: '4px 9px', cursor: 'pointer', fontSize: 12};

class SimLabBrickButtons extends React.Component {
    constructor (props) {
        super(props);
        this.unmounted = false;
        this.pulses = new Map();
        this.inputs = createBrickButtonInputs({getApi: () => this.props.api,
            onChange: () => { if (!this.unmounted) this.forceUpdate(); }});
        this.releaseAll = () => {
            for (const timer of this.pulses.values()) clearTimeout(timer);
            this.pulses.clear();
            this.perform(() => this.inputs.clear());
        };
        this.onVisibility = () => { if (document.hidden) this.releaseAll(); };
        this.refresh = () => {
            if (this.unmounted) return;
            // Read-only view refresh also observes external API input while
            // the world is paused. It never advances the simulation clock.
            const signature = JSON.stringify(this.props.api?.brickButtons() || []);
            if (signature !== this.inputSignature) {
                this.inputSignature = signature;
                this.forceUpdate();
            }
            if (!this.unmounted) this.inputFrame = requestAnimationFrame(this.refresh);
        };
    }

    componentDidMount () {
        window.addEventListener('blur', this.releaseAll);
        document.addEventListener('visibilitychange', this.onVisibility);
        this.inputFrame = requestAnimationFrame(this.refresh);
    }

    componentDidUpdate (previous) {
        if (previous.api !== this.props.api || previous.scene !== this.props.scene ||
            previous.disabled !== this.props.disabled) this.releaseAll();
    }

    componentWillUnmount () {
        this.unmounted = true;
        window.removeEventListener('blur', this.releaseAll);
        document.removeEventListener('visibilitychange', this.onVisibility);
        cancelAnimationFrame(this.inputFrame);
        this.releaseAll();
        this.perform(() => this.inputs.dispose());
    }

    perform (action) {
        try { return action(); }
        catch (error) { this.props.onError?.(error); return null; }
    }

    hold (key, hub, button) {
        if (this.props.disabled) return false;
        const result = this.perform(() => this.inputs.hold(key, hub, button));
        if (result && !result.ok && result.message) this.props.onError?.(new Error(result.message));
        return result?.ok === true;
    }

    pointerDown (event, hub, button) {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        event.currentTarget.focus();
        const key = `pointer:${event.pointerId}`;
        if (!this.hold(key, hub, button)) return;
        try { event.currentTarget.setPointerCapture(event.pointerId); }
        catch { this.perform(() => this.inputs.release(key)); }
    }

    pointerUp (event) {
        event.preventDefault(); event.stopPropagation();
        this.perform(() => this.inputs.release(`pointer:${event.pointerId}`));
    }

    key (event, hub, button, down) {
        if (![' ', 'Enter'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const key = keyOf(hub, button, event.key);
        if (down) { if (!event.repeat) this.hold(key, hub, button); }
        else this.perform(() => this.inputs.release(key));
    }

    activate (event, hub, button) {
        if (event.detail !== 0) return; // Pointer/key handlers own normal holds.
        const key = JSON.stringify(['activate', hub, button]);
        if (!this.hold(key, hub, button)) return;
        clearTimeout(this.pulses.get(key));
        this.pulses.set(key, setTimeout(() => {
            this.pulses.delete(key);
            this.perform(() => this.inputs.release(key));
        }, 150));
    }

    render () {
        const T = TEXT[this.props.locale] || TEXT.en;
        const bricks = this.props.api?.brickButtons() || [];
        if (!bricks.length) return null;
        return <fieldset data-testid="bw-sim-lab-brick-buttons" disabled={this.props.disabled}
            style={{margin: '8px 0', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6}}>
            <legend style={{fontSize: 12}}>{T.title}</legend>
            <div style={{fontSize: 11, color: '#475569', marginBottom: 6}}>{T.hint}</div>
            {bricks.map(brick => <div key={brick.hub} role="group" aria-label={`${brick.profile} ${brick.hub}`}
                style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 4}}>
                <span style={{fontSize: 11}}>{brick.hub}</span>
                {brick.buttons.map(button => <button key={button.name} type="button" aria-pressed={button.pressed}
                    data-hub={brick.hub} data-button={button.name}
                    style={{...buttonStyle, background: button.pressed ? '#bfdbfe' : '#fff'}}
                    onPointerDown={event => this.pointerDown(event, brick.hub, button.name)}
                    onPointerUp={event => this.pointerUp(event)} onPointerCancel={event => this.pointerUp(event)}
                    onLostPointerCapture={event => this.pointerUp(event)}
                    onKeyDown={event => this.key(event, brick.hub, button.name, true)}
                    onKeyUp={event => this.key(event, brick.hub, button.name, false)}
                    onBlur={() => { for (const key of [' ', 'Enter']) this.perform(() =>
                        this.inputs.release(keyOf(brick.hub, button.name, key))); }}
                    onClick={event => this.activate(event, brick.hub, button.name)}>{T[button.name] || button.name}</button>)}
            </div>)}
        </fieldset>;
    }
}

export default SimLabBrickButtons;
