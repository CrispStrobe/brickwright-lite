// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The motor mixer (docs/SIM-LAB.md "Simulate"): one row per motor of the model, on every hub that
// takes direct commands, like the faders of a mixing desk. A slider sets the motor's power
// (−100 … 100 %, 0 stops it), the square button stops it, the readout says its angle; "Stop all"
// stops every one. It folds away to one button. It drives the motors through the Robot Lab API
// (api/robot-lab-api.js setMotor / stopMotor), the same door the blocks and the lab words use, so
// a program and the mixer take turns on one port, and the last command wins.
//
// A motor whose hub runs its own program (an emulated firmware, a bytecode VM: no directCommand)
// is listed, greyed, with the reason.

import React from 'react';
import PropTypes from 'prop-types';

const MIXER_TEXT = {
    en: {
        title: 'Motors', open: 'Motors ▸', close: 'Motors ▾', help: 'Turn every motor of the model by hand: drag a slider for its power, the square stops it',
        stop: 'Stop', stopAll: 'Stop all', power: 'Power of motor {port}', angle: '{deg}°',
        noDirect: '{hub} runs its own program on this port: start it with Run',
        none: 'This model has no motors.'
    },
    de: {
        title: 'Motoren', open: 'Motoren ▸', close: 'Motoren ▾', help: 'Jeden Motor des Modells von Hand drehen: Regler für die Leistung ziehen, das Quadrat hält ihn an',
        stop: 'Stopp', stopAll: 'Alle stoppen', power: 'Leistung von Motor {port}', angle: '{deg}°',
        noDirect: '{hub} führt an diesem Port sein eigenes Programm aus: starte es mit Start',
        none: 'Dieses Modell hat keine Motoren.'
    }
};
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (m, k) => (values[k] === undefined ? m : String(values[k])));
/** The mixer's folded state, per viewer. */
export const MIXER_OPEN_KEY = 'bw-sim-lab-mixer-open';

/**
 * @param {object} props
 * @param {Array<{id: string, port: string, hub: string|null, hubName: string, direct: boolean, angleDeg: number|null}>} props.motors
 * @param {object} props.power motor id → the slider's value (%)
 * @param {(id: string, pct: number) => void} props.onPower
 * @param {(id: string) => void} props.onStop
 * @param {() => void} props.onStopAll
 */
const SimLabMotorMixer = ({motors, power, open, locale, onToggle, onPower, onStop, onStopAll, button}) => {
    const T = MIXER_TEXT[locale === 'de' ? 'de' : 'en'];
    const several = new Set(motors.map(m => m.hub)).size > 1;
    return (
        <div data-testid="bw-sim-lab-mixer" style={{display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <button type="button" style={button} data-testid="bw-sim-lab-mixer-toggle" aria-expanded={open} title={T.help}
                    onClick={onToggle}>{open ? T.close : T.open}</button>
                {open && motors.some(m => m.direct) && (
                    <button type="button" style={button} data-testid="bw-sim-lab-mixer-stop-all" onClick={onStopAll}>{T.stopAll}</button>
                )}
            </div>
            {open && (motors.length ? (
                <div role="group" aria-label={T.title} style={{display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '4px 8px', alignItems: 'center'}}>
                    {motors.map(m => {
                        const label = several ? `${m.port} · ${m.hubName}` : m.port;
                        const value = power[m.id] || 0;
                        return (
                            <React.Fragment key={m.id}>
                                <span style={{fontWeight: 600, whiteSpace: 'nowrap'}} title={m.direct ? '' : fill(T.noDirect, {hub: m.hubName})}>{label}</span>
                                <input type="range" min={-100} max={100} step={5} value={value} disabled={!m.direct}
                                    data-testid="bw-sim-lab-mixer-slider" data-port={m.port} data-motor={m.id}
                                    aria-label={fill(T.power, {port: m.port})} title={m.direct ? `${value} %` : fill(T.noDirect, {hub: m.hubName})}
                                    onChange={e => onPower(m.id, Number(e.target.value))} style={{minWidth: 90}} />
                                <button type="button" style={{...button, padding: '1px 6px'}} disabled={!m.direct} aria-label={`${T.stop} ${m.port}`}
                                    data-testid="bw-sim-lab-mixer-stop" data-port={m.port} onClick={() => onStop(m.id)}>■</button>
                                <span data-testid="bw-sim-lab-mixer-readout" data-port={m.port}
                                    style={{color: '#475569', minWidth: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>
                                    {value} %{m.angleDeg === null ? '' : ` · ${fill(T.angle, {deg: Math.round(m.angleDeg)})}`}
                                </span>
                            </React.Fragment>
                        );
                    })}
                </div>
            ) : <span style={{color: '#475569'}}>{T.none}</span>)}
        </div>
    );
};

SimLabMotorMixer.propTypes = {
    motors: PropTypes.arrayOf(PropTypes.object).isRequired,
    power: PropTypes.object.isRequired,
    open: PropTypes.bool.isRequired,
    locale: PropTypes.string,
    onToggle: PropTypes.func.isRequired,
    onPower: PropTypes.func.isRequired,
    onStop: PropTypes.func.isRequired,
    onStopAll: PropTypes.func.isRequired,
    button: PropTypes.object
};

export default SimLabMotorMixer;
