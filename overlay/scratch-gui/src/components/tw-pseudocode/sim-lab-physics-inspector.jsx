// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import React from 'react';
import PropTypes from 'prop-types';
import {inspectAssembly} from '../../lib/bw-sim/measurements/inspection.js';

const number = value => Number.isFinite(value) ? Number(value.toPrecision(7)).toString() : '—';
export default class SimLabPhysicsInspector extends React.Component {
    state = {bodyId: '', session: null};
    render () {
        const {locale, session, replaying, onHighlight} = this.props, de = locale === 'de';
        const authored = new Set(((session.runModel || session.model)?.parts || []).map(p => p.id));
        const bodies = (session.mechanism?.bodies || []).filter(b => b.parts?.some(id => authored.has(id)));
        const bodyId = (this.state.session === session && bodies.some(b => b.id === this.state.bodyId)) ? this.state.bodyId : bodies[0]?.id;
        const body = bodies.find(b => b.id === bodyId);
        let observation = null;
        try { observation = !replaying && body ? inspectAssembly(session, bodyId) : null; } catch { observation = null; }
        return <details data-testid="bw-sim-physics-inspector">
            <summary>{de ? 'Baugruppen-Physik' : 'Assembly physics'}</summary>
            <label>{de ? 'Starre Baugruppe' : 'Rigid assembly'} <select data-testid="bw-sim-physics-body" value={bodyId || ''}
                onChange={event => this.setState({bodyId: event.target.value, session}, () => {
                    if (this.props.session === session) onHighlight?.(bodies.find(b => b.id === this.state.bodyId)?.parts || []);
                })}>
                {bodies.map(b => <option key={b.id} value={b.id}>{b.id} · {b.parts.slice(0, 4).join(', ')}{b.parts.length > 4 ? '…' : ''}</option>)}
            </select></label>
            {!observation ? <p role="status">{de ? 'Physikdaten sind nicht verfügbar.' : 'Physics observations are unavailable.'}</p> : <div data-testid="bw-sim-physics-values">
                <dl>
                    <dt>{de ? 'Konfigurierte Masse' : 'Configured mass'}</dt><dd data-testid="bw-sim-physics-configured-mass">{number(observation.configuredMassKg * 1000)} g</dd>
                    <dt>{de ? 'Solver-Masse' : 'Solver mass'}</dt><dd data-testid="bw-sim-physics-solver-mass">{observation.motion === 'static' ? (de ? 'Statisch / fest eingespannt' : 'Static / clamped') : `${number(observation.solverMassKg * 1000)} g`}</dd>
                    <dt>{de ? 'Schwerpunkt in Weltkoordinaten' : 'Centre of mass in world coordinates'}</dt><dd data-testid="bw-sim-physics-com">[{observation.centerOfMassWorld.map(number).join(', ')}] m</dd>
                    {observation.motion === 'dynamic' && <><dt>{de ? 'Schwerkraftfaktor' : 'Gravity factor'}</dt><dd>{number(observation.gravityFactor)}</dd></>}
                </dl>
                {observation.inertiaKgM2 && <table data-testid="bw-sim-physics-inertia">
                    <caption>{de ? 'Solver-Trägheit um den Schwerpunkt, lokale Körperachsen (kg·m²)' : 'Solver inertia about COM, local body axes (kg·m²)'}</caption>
                    <thead><tr><th scope="col"> </th>{['x', 'y', 'z'].map(a => <th key={a} scope="col">{a}</th>)}</tr></thead>
                    <tbody>{observation.inertiaKgM2.map((row, i) => <tr key={i}><th scope="row">{['x', 'y', 'z'][i]}</th>{row.map((v, j) => <td key={j}>{number(v)}</td>)}</tr>)}</tbody>
                </table>}
                {observation.massAdjusted && <p data-testid="bw-sim-physics-mass-adjusted">{de ? 'Die Solver-Masse ist angepasst; die konfigurierte Masse bleibt getrennt.' : 'Solver mass is adjusted; configured mass remains separate.'}{Number.isFinite(observation.massFloorKg) && ` (${number(observation.massFloorKg * 1000)} g)`}</p>}
                {observation.smallInertiaRepaired && <p data-testid="bw-sim-physics-small-inertia">{de ? 'Die anfängliche Trägheits-Näherung für kleine Körper wurde aus den Kollidern korrigiert.' : 'The initial small-body inertia fallback was repaired from collider properties.'}</p>}
                {observation.inertiaAdjusted && <p data-testid="bw-sim-physics-inertia-adjusted">{de ? 'Die Solver-Trägheit enthält numerische oder reflektierte Rotor-Zusätze.' : 'Solver inertia includes numerical or reflected rotor additions.'}</p>}
                <p>{de ? 'Jolt-Beobachtungen der übernommenen Szene. Massenuntergrenzen dienen der Stabilität und können das Auslaufen verändern. Keine Hardware-Kalibrierung.' : 'Jolt observations of the admitted scene. Mass floors support stability and can change coasting. These are simulation properties.'}</p>
            </div>}
        </details>;
    }
}
SimLabPhysicsInspector.propTypes = {locale: PropTypes.string.isRequired, session: PropTypes.object.isRequired,
    replaying: PropTypes.bool, onHighlight: PropTypes.func};
