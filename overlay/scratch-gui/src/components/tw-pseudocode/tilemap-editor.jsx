/**
 * A painter for MakeCode Arcade tile maps (levels), inside the costume tab.
 *
 * A level is the data of a `set Arcade tilemap` block, so it lives in a script,
 * not in a costume; this panel lists every such block in the project and edits
 * one: a tile palette whose tiles are drawn as palette pixels, paint / erase /
 * fill on the map, a separate wall layer, map and tile size, undo/redo. Save
 * writes the level back into the block it came from (lib/bw-makecode/
 * tilemap-editor.js); nothing changes before Save.
 */
import PropTypes from 'prop-types';
import React from 'react';
import {makeT, browserLocale} from '../../lib/bw-i18n.js';
import {ARCADE_PALETTE} from '../../lib/bw-makecode/pixel-image.js';
import {
    TILE_SIZES, findTilemapBlocks, writeTilemapBlock, paintCell, eraseCell, fillCells, setWall, resizeTilemap,
    setTileSize, addTile, removeTile, paintTilePixel, createHistory, commit, undo, redo, createTilemap, addTilemapBlock
} from '../../lib/bw-makecode/tilemap-editor.js';

const L10N = {
    en: {
        'tm.title': 'Tile maps', 'tm.map': 'Tile map', 'tm.none': 'This project has no tile map. A level is set by an Arcade "set tilemap" block, which an imported MakeCode Arcade game brings with it.',
        'tm.notEditable': 'not editable', 'tm.paint': 'Paint', 'tm.erase': 'Erase', 'tm.fill': 'Fill',
        'tm.wall': 'Walls', 'tm.showWalls': 'Show walls', 'tm.undo': 'Undo', 'tm.redo': 'Redo',
        'tm.columns': 'Columns', 'tm.rows': 'Rows', 'tm.tileSize': 'Tile size', 'tm.resize': 'Resize',
        'tm.tiles': 'Tiles', 'tm.tile': 'Tile {n}', 'tm.emptyTile': 'Tile 0 (empty)', 'tm.addTile': 'Add tile',
        'tm.removeTile': 'Remove tile', 'tm.colour': 'Colour {n}', 'tm.save': 'Save', 'tm.revert': 'Revert',
        'tm.saved': 'Saved into the block of {target}.', 'tm.saveFailed': 'Could not save: the block is gone or the level is invalid.',
        'tm.unsaved': 'Unsaved changes', 'tm.wallHint': 'Click cells to add walls; click a wall to remove it.',
        'tm.zoom': 'Zoom', 'tm.new': 'New tile map', 'tm.created': 'New tile map added to {target}: a "when green flag clicked" script sets it.',
        'tm.createFailed': 'Could not add a tile map: {error}'
    },
    de: {
        'tm.title': 'Kachelkarten', 'tm.map': 'Kachelkarte', 'tm.none': 'Dieses Projekt hat keine Kachelkarte. Ein Level wird mit dem Arcade-Block „setze Kachelkarte“ gesetzt, den ein importiertes MakeCode-Arcade-Spiel mitbringt.',
        'tm.notEditable': 'nicht bearbeitbar', 'tm.paint': 'Malen', 'tm.erase': 'Radieren', 'tm.fill': 'Füllen',
        'tm.wall': 'Wände', 'tm.showWalls': 'Wände zeigen', 'tm.undo': 'Rückgängig', 'tm.redo': 'Wiederholen',
        'tm.columns': 'Spalten', 'tm.rows': 'Zeilen', 'tm.tileSize': 'Kachelgröße', 'tm.resize': 'Größe ändern',
        'tm.tiles': 'Kacheln', 'tm.tile': 'Kachel {n}', 'tm.emptyTile': 'Kachel 0 (leer)', 'tm.addTile': 'Kachel hinzufügen',
        'tm.removeTile': 'Kachel entfernen', 'tm.colour': 'Farbe {n}', 'tm.save': 'Speichern', 'tm.revert': 'Verwerfen',
        'tm.saved': 'In den Block von {target} gespeichert.', 'tm.saveFailed': 'Speichern nicht möglich: Der Block fehlt oder das Level ist ungültig.',
        'tm.unsaved': 'Ungespeicherte Änderungen', 'tm.wallHint': 'Klicke Zellen an, um Wände zu setzen; ein Klick auf eine Wand entfernt sie.',
        'tm.zoom': 'Zoom', 'tm.new': 'Neue Kachelkarte', 'tm.created': 'Neue Kachelkarte zu {target} hinzugefügt: Ein Skript „Wenn die grüne Flagge angeklickt“ setzt sie.',
        'tm.createFailed': 'Kachelkarte konnte nicht hinzugefügt werden: {error}'
    }
};
const t = makeT(L10N);

/** Draw one palette image at (x, y) with `scale` screen pixels per pixel. */
const drawImage = (ctx, image, x, y, scale) => {
    for (let py = 0; py < image.height; py++) {
        for (let px = 0; px < image.width; px++) {
            const colour = image.pixels[py * image.width + px];
            if (!colour) continue;
            ctx.fillStyle = ARCADE_PALETTE[colour];
            ctx.fillRect(x + px * scale, y + py * scale, scale, scale);
        }
    }
};

const checker = (ctx, w, h, size = 8) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e2e8f0';
    for (let y = 0; y < h; y += size) for (let x = (y / size) % 2 ? size : 0; x < w; x += size * 2) ctx.fillRect(x, y, size, size);
};

class TilemapEditor extends React.Component {
    constructor (props) {
        super(props);
        this.mapCanvas = React.createRef();
        this.tileCanvas = React.createRef();
        this.stroke = null;
        const maps = findTilemapBlocks(props.vm);
        const first = maps.findIndex(map => map.editable);
        this.state = {maps, selected: first, history: first >= 0 ? createHistory(maps[first].data) : null,
            saved: first >= 0 ? maps[first].data : null, tool: 'paint', tile: maps[first]?.data?.images.length > 1 ? 1 : 0,
            colour: 2, showWalls: true, zoom: 2, status: '', columns: maps[first]?.data?.columns || 10,
            rows: maps[first]?.data?.rows || 8};
        this.handleMapPointerDown = this.handleMapPointerDown.bind(this);
        this.handleMapPointerMove = this.handleMapPointerMove.bind(this);
        this.handleMapPointerUp = this.handleMapPointerUp.bind(this);
        this.handleTilePointerDown = this.handleTilePointerDown.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    componentDidMount () { this.draw(); }
    componentDidUpdate () { this.draw(); }

    get data () { return this.stroke ? this.stroke.data : this.state.history?.present; }

    /** True when the shown level differs from what the block holds. */
    hasUnsavedChanges () { return Boolean(this.state.history && this.state.history.present !== this.state.saved); }

    selectMap (index) {
        const map = this.state.maps[index];
        if (!map || !map.editable) return;
        this.setState({selected: index, history: createHistory(map.data), saved: map.data, status: '',
            tile: map.data.images.length > 1 ? 1 : 0, columns: map.data.columns, rows: map.data.rows});
    }

    apply (next) {
        this.setState(state => ({history: commit(state.history, next), status: '',
            columns: next.columns, rows: next.rows, tile: Math.min(state.tile, next.images.length - 1)}));
    }

    /** Add a new level (an empty 10×8 map with one tile to paint) and open it. */
    async newMap () {
        const locale = this.props.locale || browserLocale();
        try {
            const data = addTile(createTilemap({columns: 10, rows: 8, tileSize: 16})).data;
            const ref = await addTilemapBlock(this.props.vm, data, {targetId: this.props.vm.editingTarget?.id});
            const maps = findTilemapBlocks(this.props.vm);
            const selected = maps.findIndex(map => map.blockId === ref?.blockId);
            this.setState({maps, selected, history: createHistory(maps[selected].data), saved: maps[selected].data,
                tile: 1, tool: 'paint', columns: data.columns, rows: data.rows,
                status: t(locale, 'tm.created', {target: maps[selected].targetName})});
        } catch (error) {
            this.setState({status: t(locale, 'tm.createFailed', {error: error.message})});
        }
    }

    cellAt (event) {
        const canvas = this.mapCanvas.current;
        const data = this.data;
        if (!canvas || !data) return null;
        const rect = canvas.getBoundingClientRect();
        const size = data.tileSize * this.state.zoom;
        const column = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width) / size);
        const row = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height) / size);
        return column >= 0 && row >= 0 && column < data.columns && row < data.rows ? {column, row} : null;
    }

    strokeCell (cell) {
        const {tool, tile} = this.state;
        const data = this.stroke.data;
        if (tool === 'paint') this.stroke.data = paintCell(data, cell.column, cell.row, tile);
        else if (tool === 'erase') this.stroke.data = eraseCell(data, cell.column, cell.row);
        else if (tool === 'wall') this.stroke.data = setWall(data, cell.column, cell.row, this.stroke.wall);
        this.draw();
    }

    handleMapPointerDown (event) {
        const cell = this.cellAt(event);
        if (!cell || !this.state.history) return;
        const data = this.state.history.present;
        if (this.state.tool === 'fill') {
            this.apply(fillCells(data, cell.column, cell.row, this.state.tile));
            return;
        }
        // A wall stroke sets or clears walls depending on the first cell it touches.
        this.stroke = {data, wall: !data.walls[cell.row * data.columns + cell.column]};
        event.currentTarget.setPointerCapture?.(event.pointerId);
        this.strokeCell(cell);
    }

    handleMapPointerMove (event) {
        if (!this.stroke) return;
        const cell = this.cellAt(event);
        if (cell) this.strokeCell(cell);
    }

    handleMapPointerUp () {
        if (!this.stroke) return;
        const next = this.stroke.data;
        this.stroke = null;
        this.apply(next);
    }

    handleTilePointerDown (event) {
        const canvas = this.tileCanvas.current;
        const data = this.data;
        if (!canvas || !data || this.state.tile < 1) return;
        const image = data.images[this.state.tile];
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / rect.width * image.width);
        const y = Math.floor((event.clientY - rect.top) / rect.height * image.height);
        this.apply(paintTilePixel(data, this.state.tile, x, y, event.button === 2 ? 0 : this.state.colour));
    }

    handleKeyDown (event) {
        const key = event.key.toLowerCase();
        if (!(event.ctrlKey || event.metaKey) || key !== 'z') return;
        event.preventDefault();
        this.setState(state => ({history: event.shiftKey ? redo(state.history) : undo(state.history)}));
    }

    save () {
        const map = this.state.maps[this.state.selected];
        const data = this.state.history?.present;
        const locale = this.props.locale || browserLocale();
        if (!map || !data || !writeTilemapBlock(this.props.vm, map, data)) {
            this.setState({status: t(locale, 'tm.saveFailed')});
            return false;
        }
        const maps = this.state.maps.slice();
        maps[this.state.selected] = {...map, data};
        this.setState({maps, saved: data, status: t(locale, 'tm.saved', {target: map.targetName})});
        return true;
    }

    draw () {
        const data = this.data;
        const canvas = this.mapCanvas.current;
        if (canvas && data) {
            const size = data.tileSize * this.state.zoom;
            const w = data.columns * size, h = data.rows * size;
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            const ctx = canvas.getContext('2d');
            checker(ctx, w, h);
            for (let r = 0; r < data.rows; r++) {
                for (let c = 0; c < data.columns; c++) {
                    const index = data.indices[r * data.columns + c];
                    if (index) drawImage(ctx, data.images[index], c * size, r * size, this.state.zoom);
                    if (this.state.showWalls && data.walls[r * data.columns + c]) {
                        // Tinted, outlined and crossed: a red tint alone vanishes on red tiles.
                        const x = c * size, y = r * size;
                        ctx.fillStyle = 'rgba(220, 38, 38, 0.3)';
                        ctx.fillRect(x, y, size, size);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                        ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + size - 4, y + size - 4);
                        ctx.moveTo(x + size - 4, y + 4); ctx.lineTo(x + 4, y + size - 4); ctx.stroke();
                        ctx.strokeStyle = '#111827';
                        ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
                    }
                }
            }
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.15)';
            ctx.lineWidth = 1;
            for (let c = 0; c <= data.columns; c++) { ctx.beginPath(); ctx.moveTo(c * size + 0.5, 0); ctx.lineTo(c * size + 0.5, h); ctx.stroke(); }
            for (let r = 0; r <= data.rows; r++) { ctx.beginPath(); ctx.moveTo(0, r * size + 0.5); ctx.lineTo(w, r * size + 0.5); ctx.stroke(); }
        }
        const tileCanvas = this.tileCanvas.current;
        if (tileCanvas && data && data.images[this.state.tile]) {
            const image = data.images[this.state.tile];
            const scale = Math.max(4, Math.floor(192 / Math.max(image.width, image.height)));
            tileCanvas.width = image.width * scale;
            tileCanvas.height = image.height * scale;
            const ctx = tileCanvas.getContext('2d');
            checker(ctx, tileCanvas.width, tileCanvas.height, scale);
            drawImage(ctx, image, 0, 0, scale);
        }
    }

    render () {
        const locale = this.props.locale || browserLocale();
        const {maps, selected, history, tool, tile, colour, showWalls, zoom, status, columns, rows} = this.state;
        const btn = active => ({padding: '6px 10px', minHeight: 36, borderRadius: 6, fontSize: 12, cursor: 'pointer',
            whiteSpace: 'nowrap', border: `1px solid ${active ? '#4c97ff' : '#cbd5e1'}`, background: active ? '#e0edff' : '#fff'});
        const label = {fontSize: 12, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4};
        if (!maps.length || !history) {
            return (
                <div data-testid="bw-tilemap-editor" style={{padding: 24, color: '#64748b'}}>
                    {this.props.editorTools}
                    <p data-testid="bw-tilemap-none">{t(locale, 'tm.none')}</p>
                    <button type="button" data-testid="bw-tilemap-new" style={btn(true)} onClick={() => this.newMap()}>
                        {t(locale, 'tm.new')}</button>
                    <div data-testid="bw-tilemap-status" role="status" style={{fontSize: 12, marginTop: 8}}>{status}</div>
                </div>
            );
        }
        const data = history.present;
        const mapName = (map, i) => `${map.targetName} · ${t(locale, 'tm.map')} ${i + 1}` +
            (map.editable ? ` (${map.data.columns}×${map.data.rows})` : ` — ${t(locale, 'tm.notEditable')}`);
        return (
            <div data-testid="bw-tilemap-editor" tabIndex={0} onKeyDown={this.handleKeyDown}
                style={{display: 'flex', flexDirection: 'column', gap: 8, padding: 12, height: '100%',
                    boxSizing: 'border-box', overflow: 'hidden'}}>
                {this.props.editorTools}
                <div role="toolbar" style={{display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap'}}>
                    <select data-testid="bw-tilemap-select" aria-label={t(locale, 'tm.map')} value={selected}
                        onChange={event => this.selectMap(Number(event.target.value))}>
                        {maps.map((map, i) => <option key={map.blockId} value={i} disabled={!map.editable}>{mapName(map, i)}</option>)}
                    </select>
                    {['paint', 'erase', 'fill', 'wall'].map(name => (
                        <button key={name} type="button" data-testid={`bw-tilemap-tool-${name}`} aria-pressed={tool === name}
                            style={btn(tool === name)} onClick={() => this.setState({tool: name})}>
                            {t(locale, `tm.${name}`)}</button>
                    ))}
                    <label style={label}><input type="checkbox" data-testid="bw-tilemap-show-walls" checked={showWalls}
                        onChange={event => this.setState({showWalls: event.target.checked})} />{t(locale, 'tm.showWalls')}</label>
                    <button type="button" data-testid="bw-tilemap-undo" style={btn(false)} disabled={!history.past.length}
                        onClick={() => this.setState(state => ({history: undo(state.history)}))}>{t(locale, 'tm.undo')}</button>
                    <button type="button" data-testid="bw-tilemap-redo" style={btn(false)} disabled={!history.future.length}
                        onClick={() => this.setState(state => ({history: redo(state.history)}))}>{t(locale, 'tm.redo')}</button>
                    <button type="button" data-testid="bw-tilemap-new" style={btn(false)} onClick={() => this.newMap()}>
                        {t(locale, 'tm.new')}</button>
                    <label style={label}>{t(locale, 'tm.zoom')}<select value={zoom} onChange={event => this.setState({zoom: Number(event.target.value)})}>
                        {[1, 2, 3, 4].map(z => <option key={z} value={z}>{z}×</option>)}</select></label>
                </div>
                <div style={{display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap'}}>
                    <label style={label}>{t(locale, 'tm.columns')}<input type="number" min={1} max={255} style={{width: 56}}
                        data-testid="bw-tilemap-columns" value={columns} onChange={event => this.setState({columns: Number(event.target.value)})} /></label>
                    <label style={label}>{t(locale, 'tm.rows')}<input type="number" min={1} max={255} style={{width: 56}}
                        data-testid="bw-tilemap-rows" value={rows} onChange={event => this.setState({rows: Number(event.target.value)})} /></label>
                    <button type="button" data-testid="bw-tilemap-resize" style={btn(false)}
                        onClick={() => this.apply(resizeTilemap(data, columns, rows))}>{t(locale, 'tm.resize')}</button>
                    <label style={label}>{t(locale, 'tm.tileSize')}<select data-testid="bw-tilemap-tile-size" value={data.tileSize}
                        onChange={event => this.apply(setTileSize(data, Number(event.target.value)))}>
                        {TILE_SIZES.map(size => <option key={size} value={size}>{size}×{size}</option>)}</select></label>
                    <span style={{flex: 1}} />
                    {this.hasUnsavedChanges() ? <span style={{fontSize: 12, color: '#b45309'}}>{t(locale, 'tm.unsaved')}</span> : null}
                    <button type="button" data-testid="bw-tilemap-revert" style={btn(false)} disabled={!this.hasUnsavedChanges()}
                        onClick={() => this.setState(state => ({history: commit(state.history, state.saved)}))}>{t(locale, 'tm.revert')}</button>
                    <button type="button" data-testid="bw-tilemap-save" style={{...btn(true), fontWeight: 600}}
                        onClick={() => this.save()}>{t(locale, 'tm.save')}</button>
                </div>
                <div style={{display: 'flex', gap: 12, flex: '1 1 0', minHeight: 0}}>
                    <div style={{flex: '1 1 0', minWidth: 0, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 6}}>
                        <canvas ref={this.mapCanvas} data-testid="bw-tilemap-canvas" style={{imageRendering: 'pixelated', touchAction: 'none', display: 'block'}}
                            onPointerDown={this.handleMapPointerDown} onPointerMove={this.handleMapPointerMove}
                            onPointerUp={this.handleMapPointerUp} onPointerCancel={this.handleMapPointerUp} />
                    </div>
                    <div style={{width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto'}}>
                        <strong style={{fontSize: 13}}>{t(locale, 'tm.tiles')}</strong>
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 4}}>
                            {data.images.map((image, i) => (
                                <button key={i} type="button" data-testid={`bw-tilemap-tile-${i}`} aria-pressed={tile === i}
                                    title={i ? t(locale, 'tm.tile', {n: i}) : t(locale, 'tm.emptyTile')}
                                    onClick={() => this.setState({tile: i, tool: tool === 'wall' ? 'paint' : tool})}
                                    style={{...btn(tile === i), width: 40, height: 40, padding: 2}}>
                                    <TileSwatch image={image} />
                                </button>
                            ))}
                        </div>
                        <div style={{display: 'flex', gap: 4}}>
                            <button type="button" data-testid="bw-tilemap-add-tile" style={btn(false)} onClick={() => {
                                const added = addTile(data);
                                if (added.index < 0) return;
                                this.setState(state => ({history: commit(state.history, added.data), tile: added.index}));
                            }}>{t(locale, 'tm.addTile')}</button>
                            <button type="button" data-testid="bw-tilemap-remove-tile" style={btn(false)} disabled={tile < 1}
                                onClick={() => this.apply(removeTile(data, tile))}>{t(locale, 'tm.removeTile')}</button>
                        </div>
                        {tile > 0 ? (
                            <>
                                <canvas ref={this.tileCanvas} data-testid="bw-tilemap-tile-canvas"
                                    style={{imageRendering: 'pixelated', width: 192, height: 192, touchAction: 'none', border: '1px solid #cbd5e1'}}
                                    onPointerDown={this.handleTilePointerDown} onContextMenu={event => event.preventDefault()} />
                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2}}>
                                    {ARCADE_PALETTE.map((hex, i) => (
                                        <button key={i} type="button" data-testid={`bw-tilemap-colour-${i}`} aria-pressed={colour === i}
                                            title={t(locale, 'tm.colour', {n: i})} onClick={() => this.setState({colour: i})}
                                            style={{height: 22, borderRadius: 3, cursor: 'pointer',
                                                border: colour === i ? '2px solid #0f172a' : '1px solid #cbd5e1',
                                                background: hex || 'repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 50% / 8px 8px'}} />
                                    ))}
                                </div>
                            </>
                        ) : null}
                        {tool === 'wall' ? <p style={{fontSize: 12, color: '#64748b', margin: 0}}>{t(locale, 'tm.wallHint')}</p> : null}
                    </div>
                </div>
                <div data-testid="bw-tilemap-status" role="status" style={{fontSize: 12, color: '#334155', minHeight: 16}}>{status}</div>
            </div>
        );
    }
}

/** A tile drawn small for the palette. */
const TileSwatch = ({image}) => {
    const ref = React.useRef(null);
    React.useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, image.width, image.height);
        drawImage(ctx, image, 0, 0, 1);
    }, [image]);
    return <canvas ref={ref} style={{width: '100%', height: '100%', imageRendering: 'pixelated'}} />;
};
TileSwatch.propTypes = {image: PropTypes.object.isRequired};

TilemapEditor.propTypes = {
    editorTools: PropTypes.node,
    locale: PropTypes.string,
    vm: PropTypes.object.isRequired
};

export default TilemapEditor;
