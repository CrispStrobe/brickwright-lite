// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab build editor's properties panel (sim-lab-pane.jsx), as in
// BrickLink Studio and LeoCAD: what is selected (part name and number), its
// colour (the common LEGO palette, every LDraw colour, the eyedropper), its
// port, its position and rotation as numbers, its group, and the tools that
// act on a selection: mirror, line up / spread / snap to the grid, hide.
// Every change goes through the build view (editor-view3d.js), so it is one
// undoable command and refused, like a drag, when a part would go into another.

import React from 'react';

const AXES = ['x', 'y', 'z'];
/** The panel's axis (x right, y up, z towards the viewer) as LDraw's (x right, -y up, -z towards the viewer). */
const toLdu = v => [v[0], -v[1], -v[2]].map(n => (Object.is(n, -0) ? 0 : n));
const round = v => Math.round(v * 100) / 100;
/** "Left edges / Centres / Right edges" in the panel's direction → the LDraw-frame `align` mode. */
const ALIGN_MODES = {x: ['min', 'centre', 'max'], y: ['max', 'centre', 'min'], z: ['max', 'centre', 'min']};

/** A number field that commits on Enter or when it loses focus (re-keyed when the model changes). */
const NumberField = ({testid, label, value, onCommit, style}) => (
    <label style={{display: 'inline-flex', alignItems: 'center', gap: 3}}>
        <span style={{minWidth: 18, color: '#475569'}}>{label}</span>
        <input type="number" data-testid={testid} defaultValue={value} step="any" aria-label={label}
            style={{width: 64, ...style}}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); e.stopPropagation(); }}
            onBlur={e => {
                const n = Number(e.currentTarget.value);
                if (Number.isFinite(n) && n !== value) onCommit(n);
                else e.currentTarget.value = value;
            }} />
    </label>
);

const Section = ({title, children}) => (
    <div style={{display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 6, borderTop: '1px solid #e2e8f0'}}>
        <div style={{fontWeight: 600, color: '#334155'}}>{title}</div>
        {children}
    </div>
);

const SimLabProperties = ({T, lib, editor, view, selectionIds, palette, colourName, placeColor, pick, editGroup, partName, tick,
    onColour, onTick, onClose, button, field, docked}) => {
    const [alignAxis, setAlignAxis] = React.useState('x');
    const model = editor ? editor.model : {parts: []};
    const parts = selectionIds.map(id => model.parts.find(p => p.id === id)).filter(Boolean);
    const one = parts.length === 1 ? parts[0] : null;
    const meta = one ? lib.CATALOG.get(one.part) : null;
    const small = {...button, padding: '3px 7px', marginRight: 0};
    const colours = new Set(parts.map(p => p.color ?? lib.DEFAULT_COLOR));
    const shownColour = colours.size === 1 ? [...colours][0] : (parts.length ? null : placeColor);
    const run = fn => () => { fn(); onTick(); };
    const groups = (model.groups || []).filter(g => g.parts.some(id => selectionIds.includes(id)));
    const key = `${selectionIds.join(',')}:${tick}`;

    const swatch = c => (
        <button key={c.code} type="button" data-testid={`bw-sim-lab-colour-${c.code}`} aria-label={colourName(c.code)} title={colourName(c.code)}
            aria-pressed={shownColour === c.code}
            onClick={() => onColour(c.code)}
            style={{width: 22, height: 22, padding: 0, borderRadius: 4, cursor: 'pointer', background: c.value,
                border: shownColour === c.code ? '2px solid #1d4ed8' : '1px solid #94a3b8',
                boxShadow: shownColour === c.code ? '0 0 0 2px #bfdbfe' : 'none'}} />
    );

    // Position: one part's origin; several: the pivot they move by (the fields then add to it).
    const pivot = parts.length ? lib.selectionPivot(parts) : [0, 0, 0];
    const shown = one ? toLdu(one.position) : toLdu(pivot);
    const commitPosition = (k, n) => {
        if (!view) return;
        const next = shown.slice();
        next[k] = n;
        if (one) view.setPartPose(one.id, toLdu(next), one.rotation);
        else view.moveSelectionBy(toLdu(next).map((v, i) => v - pivot[i]));
        onTick();
    };
    const degrees = one ? lib.rotationToDegrees(one.rotation) : null;
    const commitDegrees = (k, n) => {
        if (!view || !one) return;
        const next = degrees.slice();
        next[k] = n;
        view.setPartPose(one.id, one.position, lib.degreesToRotation(next));
        onTick();
    };

    return (
        <div data-testid="bw-sim-lab-properties-panel" role="region" aria-label={T.properties}
            style={{display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, padding: 8, boxSizing: 'border-box',
                width: docked ? 236 : 260, maxWidth: '100%', height: '100%', overflowY: 'auto', background: '#fff',
                border: '1px solid #cbd5e1', borderRadius: 8}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <strong style={{flex: '1 1 auto'}}>{T.properties}</strong>
                {onClose && <button type="button" style={small} aria-label={T.close} title={T.close} onClick={onClose}>×</button>}
            </div>
            {editGroup && (
                <div data-testid="bw-sim-lab-group-banner" style={{background: '#ede9fe', border: '1px solid #c4b5fd', borderRadius: 6, padding: '4px 6px', color: '#4c1d95'}}>
                    {T.groupBanner.replace('{name}', editGroup.name)}{' '}
                    <button type="button" style={small} data-testid="bw-sim-lab-group-leave" onClick={run(() => view?.leaveGroup())}>{T.leaveGroup}</button>
                </div>
            )}
            {!parts.length ? <div style={{color: '#64748b'}}>{T.nothingSelected}</div> : (
                <div data-testid="bw-sim-lab-prop-name" style={{fontWeight: 600, color: '#1e3a8a'}}>
                    {one ? partName(one.part) : T.manyParts.replace('{n}', parts.length)}
                    {one && <div style={{fontWeight: 400, color: '#475569'}}>{T.partNumber.replace('{number}', lib.partNumber(one.part))}</div>}
                </div>
            )}

            <Section title={T.colour}>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: 3}} role="group" aria-label={T.colour}>
                    {palette.common.map(swatch)}
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap'}}>
                    <select data-testid="bw-sim-lab-colour-more" aria-label={T.moreColours} value="" style={{maxWidth: 150, ...field}}
                        onChange={e => e.target.value !== '' && onColour(Number(e.target.value))}>
                        <option value="">{T.moreColours}</option>
                        {palette.more.map(c => <option key={c.code} value={c.code}>{`${c.code} ${colourName(c.code)}`}</option>)}
                    </select>
                    <button type="button" data-testid="bw-sim-lab-prop-eyedropper" aria-pressed={pick === 'color'} title={T.eyedropperHelp}
                        style={{...small, background: pick === 'color' ? '#dbeafe' : '#fff'}} onClick={() => view?.setPick('color')}>{T.eyedropper}</button>
                </div>
                <div style={{color: '#475569', display: 'flex', alignItems: 'center', gap: 4}}>
                    <span style={{display: 'inline-block', width: 12, height: 12, borderRadius: 3, border: '1px solid #94a3b8',
                        background: (palette.byCode.get(shownColour ?? placeColor) || {}).value || '#ccc'}} />
                    <span data-testid="bw-sim-lab-colour-name">
                        {shownColour === null ? T.mixed : (parts.length ? colourName(shownColour) : T.currentColour.replace('{name}', colourName(placeColor)))}
                    </span>
                </div>
            </Section>

            {one && meta && lib.isPortPart(meta) && (
                <Section title={T.port}>
                    <select data-testid="bw-sim-lab-prop-port" aria-label={T.port} value={one.port || ''} style={field}
                        onChange={e => { editor.apply({type: 'setPort', id: one.id, port: e.target.value || null}); onTick(); }}>
                        <option value="">{T.none}</option>
                        {['A', 'B', 'C', 'D', 'E', 'F'].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </Section>
            )}

            {parts.length > 0 && (
                <Section title={one ? T.position : T.positionMany}>
                    <div key={key} style={{display: 'flex', flexWrap: 'wrap', gap: 4}}>
                        {AXES.map((a, k) => (
                            <NumberField key={a} testid={`bw-sim-lab-prop-${a}`} label={T[a]} value={round(shown[k])} style={field}
                                onCommit={n => commitPosition(k, n)} />
                        ))}
                    </div>
                </Section>
            )}

            {parts.length > 0 && (
                <Section title={T.rotation}>
                    {one && (
                        <div key={key} style={{display: 'flex', flexWrap: 'wrap', gap: 4}}>
                            {AXES.map((a, k) => (
                                <NumberField key={a} testid={`bw-sim-lab-prop-r${a}`} label={T[a]} value={round(degrees[k])} style={field}
                                    onCommit={n => commitDegrees(k, n)} />
                            ))}
                        </div>
                    )}
                    {AXES.map(a => (
                        <div key={a} style={{display: 'flex', alignItems: 'center', gap: 4}}>
                            <span style={{flex: '1 1 auto', color: '#475569'}}>{T.turnAbout.replace('{axis}', T[a])}</span>
                            <button type="button" style={small} data-testid={`bw-sim-lab-prop-turn-${a}-minus`}
                                onClick={run(() => view?.turnSelectionBy(a, -90))}>{T.minus90}</button>
                            <button type="button" style={small} data-testid={`bw-sim-lab-prop-turn-${a}-plus`}
                                onClick={run(() => view?.turnSelectionBy(a, 90))}>{T.plus90}</button>
                        </div>
                    ))}
                </Section>
            )}

            {parts.length > 0 && (
                <Section title={T.group}>
                    {!groups.length && !editGroup && <div style={{color: '#64748b'}}>{T.notInGroup}</div>}
                    {groups.map(g => (
                        <div key={`${g.id}:${tick}`} style={{display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap'}}>
                            <input type="text" data-testid="bw-sim-lab-prop-group-name" aria-label={T.groupName} defaultValue={g.name}
                                style={{width: 110, ...field}} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); e.stopPropagation(); }}
                                onBlur={e => {
                                    const name = e.currentTarget.value.trim();
                                    if (name && name !== g.name) { editor.apply({type: 'renameGroup', id: g.id, name}); onTick(); }
                                }} />
                            {(!editGroup || editGroup.id !== g.id) && (
                                <button type="button" style={small} data-testid="bw-sim-lab-group-edit" onClick={run(() => view?.enterGroup(g.id))}>{T.editGroup}</button>
                            )}
                            {!editGroup && <button type="button" style={small} onClick={run(() => view?.ungroupSelection())}>{T.ungroup}</button>}
                        </div>
                    ))}
                </Section>
            )}

            {parts.length > 0 && (
                <Section title={T.mirror}>
                    <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                        <button type="button" style={small} data-testid="bw-sim-lab-prop-mirror-x" title={T.mirrorXHelp} onClick={run(() => view?.mirror('x'))}>{T.mirrorX}</button>
                        <button type="button" style={small} data-testid="bw-sim-lab-prop-mirror-z" title={T.mirrorZHelp} onClick={run(() => view?.mirror('z'))}>{T.mirrorZ}</button>
                    </div>
                </Section>
            )}

            {parts.length > 0 && (
                <Section title={T.align}>
                    <label style={{display: 'flex', alignItems: 'center', gap: 4}}>{T.alignAxis}
                        <select data-testid="bw-sim-lab-align-axis" value={alignAxis} style={field} onChange={e => setAlignAxis(e.target.value)}>
                            {AXES.map(a => <option key={a} value={a}>{T[`axis${a.toUpperCase()}`]}</option>)}
                        </select>
                    </label>
                    <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                        {T[`align${alignAxis.toUpperCase()}`].map((label, i) => (
                            <button key={label} type="button" style={small} data-testid={`bw-sim-lab-align-${['min', 'centre', 'max'][i]}`}
                                disabled={parts.length < 2} onClick={run(() => view?.align(alignAxis, ALIGN_MODES[alignAxis][i]))}>{label}</button>
                        ))}
                        <button type="button" style={small} data-testid="bw-sim-lab-distribute" disabled={parts.length < 3}
                            onClick={run(() => view?.distribute(alignAxis))}>{T.distribute}</button>
                        <button type="button" style={small} data-testid="bw-sim-lab-to-grid" onClick={run(() => view?.toGrid())}>{T.toGrid}</button>
                    </div>
                </Section>
            )}

            {parts.length > 0 && (
                <Section title={T.view}>
                    <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                        <button type="button" style={small} data-testid="bw-sim-lab-prop-hide" onClick={run(() => view?.hideSelection())}>{T.hide}</button>
                        <button type="button" style={small} data-testid="bw-sim-lab-prop-isolate" onClick={run(() => view?.isolate())}>{T.isolate}</button>
                    </div>
                </Section>
            )}
        </div>
    );
};

export default SimLabProperties;
