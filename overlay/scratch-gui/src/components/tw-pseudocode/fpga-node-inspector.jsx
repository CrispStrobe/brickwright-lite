import React from 'react';
import {GATE_DEFS} from '../../lib/bw-fpga/gate-builder.js';
// (no board-package import — this is ported for the gate domain)

/**
 * Editing a placed node — a small floating inspector (double-click a node) and a
 * right-click menu (duplicate / delete). Modelled on bw-circuit-ui's InlineEditor
 * and ContextMenu (native numeric controls, the same interaction), but written
 * for the gate domain (bus width, RAM geometry, I/O name) rather than board parts,
 * so it carries no board coupling.
 */

const nodeTitle = data => {
    if (data.kind === 'in' || data.kind === 'out') return data.name || data.kind;
    if (data.kind === 'memory') return 'RAM';
    if (data.kind === 'instance') return data.module || 'block';
    return (GATE_DEFS[data.gtype] && GATE_DEFS[data.gtype].label) || data.gtype || 'node';
};

// Which fields are editable for this node, as [key, type] pairs.
const fieldsFor = data => {
    const f = [];
    if (data.kind === 'in' || data.kind === 'out') f.push(['name', 'text']);
    if (data.kind === 'memory') { f.push(['dataWidth', 'number']); f.push(['addrWidth', 'number']); }
    else if (data.kind !== 'instance') f.push(['width', 'number']);
    return f;
};

export function NodeInspector ({node, x, y, onChange, onClose}) {
    const ref = React.useRef(null);
    React.useEffect(() => {
        const onKey = e => { if (e.key === 'Escape') onClose(); };
        const onDown = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        window.addEventListener('keydown', onKey);
        window.addEventListener('mousedown', onDown);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
    }, [onClose]);

    const data = node.data;
    const fields = fieldsFor(data);
    return (
        <div ref={ref} data-testid="bw-fpga-inspector" onMouseDown={e => e.stopPropagation()}
            style={{position: 'fixed', left: x + 16, top: y - 8, background: '#fff', border: '1px solid #3498db',
                borderRadius: 6, padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, zIndex: 200,
                minWidth: 130, boxShadow: '0 4px 12px rgba(0,0,0,0.25)'}}>
            <div style={{color: '#1d4ed8', fontWeight: 'bold', marginBottom: 6}}>{nodeTitle(data)}</div>
            {fields.map(([key, type], i) => (
                <div key={key} style={{display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3}}>
                    <span style={{color: '#7f8c8d', fontSize: 10, minWidth: 62}}>{key}:</span>
                    <input
                        autoFocus={i === 0}
                        type={type}
                        inputMode={type === 'number' ? 'numeric' : undefined}
                        min={type === 'number' ? 1 : undefined}
                        value={data[key] ?? (type === 'number' ? 1 : '')}
                        onChange={e => onChange(node.id, {[key]: type === 'number' ? Math.max(1, Number(e.target.value) || 1) : e.target.value})}
                        onKeyDown={e => { if (e.key === 'Enter') onClose(); }}
                        style={{width: 72, height: 26, boxSizing: 'border-box', padding: '2px 4px',
                            border: '1px solid #64748b', borderRadius: 3, fontFamily: 'monospace', fontSize: 11}}
                    />
                </div>
            ))}
            {!fields.length ? <div style={{color: '#94a3b8', fontSize: 10}}>{'no editable fields'}</div> : null}
        </div>
    );
}

const MenuItem = ({label, onClick, danger}) => (
    <div role="menuitem" onClick={onClick}
        style={{padding: '5px 12px', cursor: 'pointer', fontSize: 12, color: danger ? '#b91c1c' : '#1e293b', whiteSpace: 'nowrap'}}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.10)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >{label}</div>
);

export function NodeContextMenu ({x, y, target, onClose, onDelete, onDuplicate}) {
    React.useEffect(() => {
        const onKey = e => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div data-testid="bw-fpga-menu" onMouseLeave={onClose}
            style={{position: 'fixed', left: x, top: y, background: '#fff', border: '1px solid #cbd5e1',
                borderRadius: 6, padding: '4px 0', zIndex: 210, boxShadow: '0 4px 12px rgba(0,0,0,0.25)'}}>
            {target === 'node' ? <MenuItem label="Duplicate" onClick={() => { onDuplicate(); onClose(); }} /> : null}
            <MenuItem label={target === 'edge' ? 'Delete wire' : 'Delete'} danger onClick={() => { onDelete(); onClose(); }} />
        </div>
    );
}
