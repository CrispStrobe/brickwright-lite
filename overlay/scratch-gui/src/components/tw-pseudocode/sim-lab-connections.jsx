// SPDX-License-Identifier: BSD-3-Clause
import React from 'react';

const TEXT = {
    en: {title: 'Program connection', brick: 'Brick', route: 'Connection', bluetooth: 'Bluetooth', serial: 'USB serial',
        bridge: 'Local bridge', http: 'HTTP bridge', connect: 'Connect', disconnect: 'Disconnect',
        idle: 'Disconnected', connecting: 'Connecting…', connected: 'Connected to the model', failed: 'Connection failed'},
    de: {title: 'Programmverbindung', brick: 'Hub', route: 'Verbindung', bluetooth: 'Bluetooth', serial: 'USB seriell',
        bridge: 'Lokale Bridge', http: 'HTTP-Bridge', connect: 'Verbinden', disconnect: 'Trennen',
        idle: 'Getrennt', connecting: 'Verbindet…', connected: 'Mit dem Modell verbunden', failed: 'Verbindung fehlgeschlagen'}
};

const SimLabConnections = ({locale, bricks, hubId, route, routes, status, disabled, onHub, onRoute, onConnect, onDisconnect}) => {
    const T = TEXT[locale] || TEXT.en;
    if (!routes?.length) return null;
    return <fieldset data-testid="bw-sim-lab-connections" disabled={disabled}
        style={{margin: '8px 0', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12}}>
        <legend>{T.title}</legend>
        <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6}}>
            {bricks.length > 1 && <label>{T.brick} <select aria-label={T.brick} value={hubId} onChange={event => onHub(event.target.value)}>
                {bricks.map(brick => <option key={brick.id} value={brick.id}>{brick.id} ({brick.profile})</option>)}
            </select></label>}
            <label>{T.route} <select aria-label={T.route} data-testid="bw-sim-lab-connection-route"
                value={route} onChange={event => onRoute(event.target.value)}>
                {routes.map(value => <option key={value} value={value}>{T[value]}</option>)}
            </select></label>
            {route !== 'bluetooth' && <>
                <button type="button" disabled={status === 'connecting' || status === 'connected'} onClick={onConnect}>{T.connect}</button>
                <button type="button" disabled={status === 'idle'} onClick={onDisconnect}>{T.disconnect}</button>
                <span role="status" aria-live="polite">{T[status]}</span>
            </>}
        </div>
    </fieldset>;
};

export default SimLabConnections;
