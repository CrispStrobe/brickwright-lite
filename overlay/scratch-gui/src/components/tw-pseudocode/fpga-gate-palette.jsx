import React from 'react';
import {gateShape} from '../../lib/bw-fpga/glyphs.js';
import {paletteItems} from '../../lib/bw-fpga/palette-catalog.js';
import {sevenSegSvg} from '../../lib/bw-fpga/output-devices.js';

/**
 * The gate-builder palette — a categorised, searchable sidebar you drag parts
 * from onto the canvas, the way CircuitVerse/icestudio do. It is a thin view
 * over the pure `buildPaletteCatalog` data; each row starts a drag carrying a
 * descriptor the canvas turns into a node. Gate rows preview the SHARED glyph,
 * so the palette and the placed node look identical.
 */

export const DRAG_MIME = 'application/bw-fpga-part';

// A small preview of what dropping this item makes.
const Thumb = ({item}) => {
    if (item.kind === 'gate') {
        return (
            <svg className="bw-glyph" width={34} height={24} viewBox="0 0 60 44"
                style={{overflow: 'visible', flex: '0 0 auto'}}
                dangerouslySetInnerHTML={{__html: gateShape({type: item.gtype, x: 4, y: 2, width: 48, height: 40})}} />
        );
    }
    if (item.kind === 'seg7') {
        return (
            <svg width={22} height={30} viewBox="0 0 100 160" style={{flex: '0 0 auto', background: '#0f172a', borderRadius: 3}}
                dangerouslySetInnerHTML={{__html: sevenSegSvg(8)}} />
        );
    }
    if (item.kind === 'led') {
        return <span style={{flex: '0 0 auto', width: 18, height: 18, borderRadius: '50%',
            border: '2px solid #dc2626', background: 'radial-gradient(circle at 35% 30%, #fecaca, #ef4444 70%)'}} />;
    }
    const bg = item.kind === 'in' ? '#e0f2fe' : item.kind === 'out' ? '#fef9c3'
        : item.kind === 'memory' ? '#f0fdfa' : '#ede9fe';
    const border = item.kind === 'in' ? '#0284c7' : item.kind === 'out' ? '#ca8a04'
        : item.kind === 'memory' ? '#0f766e' : '#7c3aed';
    return (
        <span style={{flex: '0 0 auto', width: 34, height: 20, borderRadius: item.kind === 'in' || item.kind === 'out' ? 10 : 4,
            border: `1.4px solid ${border}`, background: bg, display: 'inline-block'}} />
    );
};

const Row = ({item, onDragStart}) => (
    <div
        draggable
        onDragStart={e => onDragStart(e, item)}
        title={item.label}
        style={{display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', cursor: 'grab',
            borderRadius: 4, userSelect: 'none'}}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.10)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
        <Thumb item={item} />
        <span style={{fontSize: 12}}>{item.label}</span>
    </div>
);

const FpgaGatePalette = ({catalog, onDragStartItem}) => {
    const [query, setQuery] = React.useState('');
    const onDragStart = (e, item) => {
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'copy';
        if (onDragStartItem) onDragStartItem(item);
    };

    const q = query.trim().toLowerCase();
    const sections = q
        ? [{id: 'search', label: 'Results', items: paletteItems(catalog).filter(i => i.label.toLowerCase().includes(q))}]
        : catalog;

    return (
        <div data-testid="bw-fpga-palette" style={{width: 150, flex: '0 0 auto', borderRight: '1px solid rgba(71,85,105,0.25)',
            paddingRight: 6, marginRight: 8, overflowY: 'auto', maxHeight: '48vh'}}>
            <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="search parts…"
                data-testid="bw-fpga-palette-search"
                style={{width: '100%', boxSizing: 'border-box', padding: '3px 6px', marginBottom: 6, fontSize: 12}}
            />
            {sections.map(section => (
                <div key={section.id} style={{marginBottom: 6}}>
                    <div style={{fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em',
                        color: '#64748b', margin: '2px 0 1px 4px'}}>{section.label}</div>
                    {section.items.map((item, i) => (
                        <Row key={`${item.kind}-${item.gtype || item.label}-${i}`} item={item} onDragStart={onDragStart} />
                    ))}
                </div>
            ))}
        </div>
    );
};

export default FpgaGatePalette;
