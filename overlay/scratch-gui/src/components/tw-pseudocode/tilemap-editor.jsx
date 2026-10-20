/**
 * A painter for MakeCode Arcade tile maps (levels), inside the costume tab.
 *
 * A level is the data of a `set Arcade tilemap` block, so it lives in a script,
 * not in a costume; this panel lists every such block in the project and edits
 * one: a tile palette whose tiles are drawn as palette pixels, paint / erase /
 * fill on the map, a separate wall layer, map and tile size, undo/redo, and
 * where sprites start on the map (lib/bw-makecode/tilemap-placements.js). Save
 * writes the level back into the block it came from (lib/bw-makecode/
 * tilemap-editor.js); nothing changes before Save.
 */
import PropTypes from 'prop-types';
import LegacyTileDefinitionEditor from './legacy-tile-definition-editor.jsx';
import React from 'react';
import {makeT, browserLocale} from '../../lib/bw-i18n.js';
import {inspectTilemapPalette, observeTilemapPalette, tilemapPixelColor, drawTilemapImage} from '../../lib/bw-makecode/tilemap-palette.js';
import {
    TILE_SIZES, findTilemapBlocks, writeTilemapBlock, tilemapText, paintCell, eraseCell, fillCells, setWall, resizeTilemap,
    setTileSize, addTile, removeTile, paintTilePixel, renameTile, createHistory, commit, undo, redo, createTilemap, addTilemapBlock
} from '../../lib/bw-makecode/tilemap-editor.js';
import {
    findMapPlacements, placeableSprites, stagePlacement, unstagePlacement, placementsChanged, writePlacements
} from '../../lib/bw-makecode/tilemap-placements.js';

const L10N = {
    en: {
        'tm.title': 'Tile maps', 'tm.map': 'Tile map', 'tm.none': 'This project has no tile map. A level is set by an Arcade "set tilemap" block, which an imported MakeCode Arcade game brings with it.',
        'tm.noneEditable': 'These layouts need a different editing path:', 'tm.notEditable': 'not editable', 'tm.paint': 'Paint', 'tm.erase': 'Erase', 'tm.fill': 'Fill',
        'tm.wall': 'Walls', 'tm.showWalls': 'Show walls', 'tm.undo': 'Undo', 'tm.redo': 'Redo',
        'tm.columns': 'Columns', 'tm.rows': 'Rows', 'tm.tileSize': 'Tile size', 'tm.resize': 'Resize',
        'tm.tiles': 'Tiles', 'tm.tile': 'Tile {n}', 'tm.emptyTile': 'Tile 0 (empty)', 'tm.addTile': 'Add tile',
        'tm.removeTile': 'Remove tile', 'tm.colour': 'Colour {n}', 'tm.save': 'Save', 'tm.revert': 'Revert',
        'tm.paletteStartup': 'Preview uses the project startup palette; later code can change it while running.',
        'tm.paletteUnknown': 'The startup palette is dynamic or conflicting. Gray is an index preview, not the game colors. Edit the palette in Code or Blocks.',
        'tm.paletteUnavailable': 'The project palette could not be read: {error}. Gray is an index preview, not the game colors.',
        'tm.saved': 'Saved into the block of {target}.', 'tm.saveFailed': 'Could not save: the block is gone or the level is invalid.',
        'tm.unsaved': 'Unsaved changes', 'tm.wallHint': 'Click cells to add walls; click a wall to remove it.',
        'tm.zoom': 'Zoom', 'tm.new': 'New tile map', 'tm.created': 'New tile map added to {target}: a "when green flag clicked" script sets it.',
        'tm.createFailed': 'Could not add a tile map: {error}',
        'tm.legacyLayout': 'Colour-index layout. Tile artwork and walls remain in the colour-tile blocks.',
        'tm.computedScale': 'computed tile size', 'tm.computedImage': 'computed layout image', 'tm.mutableFrames': 'runtime frame definitions',
        'tm.missingArtwork': 'missing or ambiguous artwork', 'tm.layeredArtwork': 'edit this layered image in Pixel', 'tm.unsupportedArtwork': 'unsupported layout artwork',
        'tm.tileName': 'Tile name', 'tm.invalidTileName': 'Use a unique tile name with 1–128 characters.',
        'tm.place': 'Place sprite', 'tm.placements': 'Sprite placements', 'tm.placeSprite': 'Sprite to place',
        'tm.placeHint': 'Click a cell to place the chosen sprite there; it starts on that tile when this level is set.',
        'tm.noSprites': 'No sprite variable is used by an Arcade block yet: create a sprite and keep it in a variable first.',
        'tm.noPlacements': 'No sprite is placed on this map.', 'tm.placedAt': '{sprite} on tile ({column}, {row})',
        'tm.computedPlacement': '{sprite} on a computed tile', 'tm.outside': 'outside the map', 'tm.removePlacement': 'Remove',
        'tm.placementsFailed': 'The map was saved, but the placements were not: the blocks changed since this map was opened.'
    },
    de: {
        'tm.title': 'Kachelkarten', 'tm.map': 'Kachelkarte', 'tm.none': 'Dieses Projekt hat keine Kachelkarte. Ein Level wird mit dem Arcade-Block „setze Kachelkarte“ gesetzt, den ein importiertes MakeCode-Arcade-Spiel mitbringt.',
        'tm.noneEditable': 'Diese Grundrisse benötigen einen anderen Bearbeitungsweg:', 'tm.notEditable': 'nicht bearbeitbar', 'tm.paint': 'Malen', 'tm.erase': 'Radieren', 'tm.fill': 'Füllen',
        'tm.wall': 'Wände', 'tm.showWalls': 'Wände zeigen', 'tm.undo': 'Rückgängig', 'tm.redo': 'Wiederholen',
        'tm.columns': 'Spalten', 'tm.rows': 'Zeilen', 'tm.tileSize': 'Kachelgröße', 'tm.resize': 'Größe ändern',
        'tm.tiles': 'Kacheln', 'tm.tile': 'Kachel {n}', 'tm.emptyTile': 'Kachel 0 (leer)', 'tm.addTile': 'Kachel hinzufügen',
        'tm.removeTile': 'Kachel entfernen', 'tm.colour': 'Farbe {n}', 'tm.save': 'Speichern', 'tm.revert': 'Verwerfen',
        'tm.paletteStartup': 'Die Vorschau verwendet die Projekt-Startpalette; späterer Code kann sie beim Ausführen ändern.',
        'tm.paletteUnknown': 'Die Startpalette ist dynamisch oder widersprüchlich. Grau zeigt nur die Indizes, nicht die Spielfarben. Bearbeite die Palette in Code oder Blöcken.',
        'tm.paletteUnavailable': 'Die Projektpalette konnte nicht gelesen werden: {error}. Grau zeigt nur die Indizes, nicht die Spielfarben.',
        'tm.saved': 'In den Block von {target} gespeichert.', 'tm.saveFailed': 'Speichern nicht möglich: Der Block fehlt oder das Level ist ungültig.',
        'tm.unsaved': 'Ungespeicherte Änderungen', 'tm.wallHint': 'Klicke Zellen an, um Wände zu setzen; ein Klick auf eine Wand entfernt sie.',
        'tm.zoom': 'Zoom', 'tm.new': 'Neue Kachelkarte', 'tm.created': 'Neue Kachelkarte zu {target} hinzugefügt: Ein Skript „Wenn die grüne Flagge angeklickt“ setzt sie.',
        'tm.createFailed': 'Kachelkarte konnte nicht hinzugefügt werden: {error}',
        'tm.legacyLayout': 'Farbindizierter Grundriss. Kachelgrafiken und Wände bleiben in den Farbkachel-Blöcken.',
        'tm.computedScale': 'berechnete Kachelgröße', 'tm.computedImage': 'berechnetes Grundrissbild', 'tm.mutableFrames': 'Bilddefinitionen zur Laufzeit',
        'tm.missingArtwork': 'fehlende oder mehrdeutige Grafik', 'tm.layeredArtwork': 'dieses Ebenenbild in Pixel bearbeiten', 'tm.unsupportedArtwork': 'nicht unterstützte Grundrissgrafik',
        'tm.tileName': 'Kachelname', 'tm.invalidTileName': 'Verwende einen eindeutigen Kachelnamen mit 1–128 Zeichen.',
        'tm.place': 'Figur platzieren', 'tm.placements': 'Figurenplätze', 'tm.placeSprite': 'Zu platzierende Figur',
        'tm.placeHint': 'Klicke eine Zelle an, um die gewählte Figur dort zu platzieren; sie beginnt auf dieser Kachel, wenn das Level gesetzt wird.',
        'tm.noSprites': 'Noch keine Figurenvariable wird von einem Arcade-Block benutzt: Erzeuge zuerst eine Figur und speichere sie in einer Variablen.',
        'tm.noPlacements': 'Auf dieser Karte ist keine Figur platziert.', 'tm.placedAt': '{sprite} auf Kachel ({column}, {row})',
        'tm.computedPlacement': '{sprite} auf einer berechneten Kachel', 'tm.outside': 'außerhalb der Karte', 'tm.removePlacement': 'Entfernen',
        'tm.placementsFailed': 'Die Karte wurde gespeichert, die Platzierungen nicht: Die Blöcke haben sich seit dem Öffnen geändert.'
    }
};
const t = makeT(L10N);

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
        this.state = {palette: inspectTilemapPalette(props.vm), maps, selected: first, history: first >= 0 ? createHistory(maps[first].data) : null,
            saved: first >= 0 ? maps[first].data : null, tool: 'paint', tile: maps[first]?.data?.images.length > 1 ? 1 : 0,
            tileNameDraft: null, colour: 2, showWalls: true, zoom: 2, status: '', columns: maps[first]?.data?.columns || 10,
            rows: maps[first]?.data?.rows || 8, ...this.placementState(maps[first])};
        this.handleMapPointerDown = this.handleMapPointerDown.bind(this);
        this.handleMapPointerMove = this.handleMapPointerMove.bind(this);
        this.handleMapPointerUp = this.handleMapPointerUp.bind(this);
        this.handleTilePointerDown = this.handleTilePointerDown.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.refreshPalette = this.refreshPalette.bind(this);
    }

    componentDidMount () {
        this.releasePalette = observeTilemapPalette(this.props.vm, this.refreshPalette);
        this.draw();
    }
    componentDidUpdate (previous) {
        if (previous.vm !== this.props.vm) {
            this.releasePalette();
            this.releasePalette = observeTilemapPalette(this.props.vm, this.refreshPalette);
        }
        this.draw();
    }
    componentWillUnmount () { this.releasePalette(); }
    refreshPalette (palette) {
        if (JSON.stringify(palette) !== JSON.stringify(this.state.palette)) this.setState({palette});
    }

    get data () { return this.stroke ? this.stroke.data : this.state.history?.present; }

    /** True when the shown level differs from what the block holds. */
    hasUnsavedChanges () {
        return Boolean(this.state.history && (this.state.history.present !== this.state.saved ||
            placementsChanged(this.state.placements, this.state.placementDraft)));
    }

    /** The placements on a map, read from its blocks, and the sprites a new one may use. */
    placementState (map) {
        const placements = map ? findMapPlacements(this.props.vm, map) : [];
        const sprites = map ? placeableSprites(this.props.vm, map) : [];
        return {placements, placementDraft: placements, sprites, placeSprite: sprites[0]?.id || null};
    }

    selectMap (index) {
        const map = this.state.maps[index];
        if (!map || !map.editable) return;
        this.setState({selected: index, history: createHistory(map.data), saved: map.data, status: '',
            tileNameDraft: null, tool: 'paint', tile: map.data.images.length > 1 ? 1 : 0, columns: map.data.columns, rows: map.data.rows,
            ...this.placementState(map)});
    }

    commitTileName () {
        if (this.state.tileNameDraft === null) return;
        const name = this.state.tileNameDraft;
        const next = renameTile(this.data, this.state.tile, name);
        if (next === this.data && name.trim() !== (this.data.images[this.state.tile]?.displayName || '')) {
            this.setState({status: t(this.props.locale || browserLocale(), 'tm.invalidTileName')});
            return;
        }
        this.apply(next);
    }

    apply (next) {
        this.setState(state => ({history: commit(state.history, next), tileNameDraft: null, status: '',
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
                tile: 1, tool: 'paint', columns: data.columns, rows: data.rows, ...this.placementState(maps[selected]),
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
        if (this.state.tool === 'place') {
            const sprite = this.state.sprites.find(each => each.id === this.state.placeSprite);
            if (sprite) this.setState(state => ({placementDraft: stagePlacement(state.placementDraft, sprite, cell.column, cell.row), status: ''}));
            return;
        }
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
        const maps = findTilemapBlocks(this.props.vm);
        const written = maps[this.state.selected].data;
        const sharedChanged = tilemapText(written) !== tilemapText(data);
        // Placements are separate blocks; write them after the map, refusing if
        // those blocks changed since they were read.
        let placementsSaved = true;
        if (placementsChanged(this.state.placements, this.state.placementDraft)) {
            placementsSaved = Boolean(writePlacements(this.props.vm, maps[this.state.selected],
                this.state.placements, this.state.placementDraft));
        }
        this.setState(state => ({maps, saved: sharedChanged ? written : data,
            history: sharedChanged ? commit(state.history, written) : state.history,
            ...(placementsSaved ? this.placementState(maps[state.selected]) : {}),
            status: t(locale, placementsSaved ? 'tm.saved' : 'tm.placementsFailed', {target: map.targetName})}));
        return placementsSaved;
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
                    if (index) drawTilemapImage(ctx, data.images[index], c * size, r * size, this.state.zoom, this.state.palette);
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
            // Placed sprites: a ringed disc with the sprite's initial on its tile.
            for (const entry of this.state.placementDraft || []) {
                if (entry.removed || !entry.editable || entry.column >= data.columns || entry.row >= data.rows) continue;
                const cx = (entry.column + 0.5) * size, cy = (entry.row + 0.5) * size, radius = Math.max(4, size * 0.4);
                ctx.beginPath(); ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(37, 99, 235, 0.85)'; ctx.fill();
                ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(8, Math.round(radius))}px sans-serif`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText((entry.sprite.name[0] || '?').toUpperCase(), cx, cy + 0.5);
            }
        }
        const tileCanvas = this.tileCanvas.current;
        if (tileCanvas && data && data.images[this.state.tile]) {
            const image = data.images[this.state.tile];
            const scale = Math.max(4, Math.floor(192 / Math.max(image.width, image.height)));
            tileCanvas.width = image.width * scale;
            tileCanvas.height = image.height * scale;
            const ctx = tileCanvas.getContext('2d');
            checker(ctx, tileCanvas.width, tileCanvas.height, scale);
            drawTilemapImage(ctx, image, 0, 0, scale, this.state.palette);
        }
    }

    renderPlacements (locale, btn, label, data) {
        const {tool, sprites, placeSprite, placementDraft} = this.state;
        return (
            <div data-testid="bw-tilemap-placements" style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                <strong style={{fontSize: 13}}>{t(locale, 'tm.placements')}</strong>
                {tool === 'place' ? (sprites.length ? <>
                    <label style={label}>{t(locale, 'tm.placeSprite')}
                        <select data-testid="bw-tilemap-place-sprite" value={placeSprite || ''}
                            onChange={event => this.setState({placeSprite: event.target.value})}>
                            {sprites.map(sprite => <option key={sprite.id} value={sprite.id}>{sprite.name}</option>)}
                        </select></label>
                    <p style={{fontSize: 12, color: '#64748b', margin: 0}}>{t(locale, 'tm.placeHint')}</p>
                </> : <p data-testid="bw-tilemap-no-sprites" style={{fontSize: 12, color: '#64748b', margin: 0}}>{t(locale, 'tm.noSprites')}</p>) : null}
                {placementDraft.some(entry => !entry.removed) ? null :
                    <p style={{fontSize: 12, color: '#64748b', margin: 0}}>{t(locale, 'tm.noPlacements')}</p>}
                {placementDraft.map((entry, i) => entry.removed ? null : (
                    <div key={entry.blockId || `new-${i}`} data-testid={`bw-tilemap-placement-${i}`}
                        style={{display: 'flex', alignItems: 'center', gap: 4, fontSize: 12}}>
                        <span style={{flex: 1, minWidth: 0}}>
                            {entry.editable ? t(locale, 'tm.placedAt', {sprite: entry.sprite.name, column: entry.column, row: entry.row}) :
                                t(locale, 'tm.computedPlacement', {sprite: entry.sprite?.name || '?'})}
                            {entry.editable && (entry.column >= data.columns || entry.row >= data.rows) ?
                                ` (${t(locale, 'tm.outside')})` : ''}
                        </span>
                        {entry.editable ? <button type="button" data-testid={`bw-tilemap-placement-remove-${i}`} style={btn(false)}
                            onClick={() => this.setState(state => ({placementDraft: unstagePlacement(state.placementDraft, i)}))}>
                            {t(locale, 'tm.removePlacement')}</button> : null}
                    </div>
                ))}
            </div>
        );
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
                <div data-testid="bw-tilemap-palette-state" data-palette-kind={this.state.palette.kind} role="status"
                    style={{fontSize: 12, flexShrink: 0}}>
                    {this.state.palette.kind === 'unavailable' ? t(locale, 'tm.paletteUnavailable',
                        {error: this.state.palette.errorMessage}) :
                        !this.state.palette.colors ? t(locale, 'tm.paletteUnknown') :
                        this.state.palette.laterChanges ? t(locale, 'tm.paletteStartup') : null}
                </div>
                <LegacyTileDefinitionEditor vm={this.props.vm} locale={locale} palette={this.state.palette} />
                    <p data-testid="bw-tilemap-none">{t(locale, maps.length ? 'tm.noneEditable' : 'tm.none')}</p>
                    <ul>{maps.filter(map => map.reason).map(map => <li key={map.blockId}>{map.targetName}: {t(locale, `tm.${map.reason}`)}</li>)}</ul>
                    <button type="button" data-testid="bw-tilemap-new" style={btn(true)} onClick={() => this.newMap()}>
                        {t(locale, 'tm.new')}</button>
                    <div data-testid="bw-tilemap-status" role="status" style={{fontSize: 12, marginTop: 8}}>{status}</div>
                </div>
            );
        }
        const data = history.present;
        const legacy = maps[selected]?.kind === 'legacyLayout';
        const mapName = (map, i) => `${map.targetName} · ${t(locale, 'tm.map')} ${i + 1}` +
            (map.editable ? ` (${map.data.columns}×${map.data.rows})` : ` — ${t(locale, map.reason ? `tm.${map.reason}` : 'tm.notEditable')}`);
        return (
            <div data-testid="bw-tilemap-editor" tabIndex={0} onKeyDown={this.handleKeyDown}
                style={{display: 'flex', flexDirection: 'column', gap: 8, padding: 12, height: '100%',
                    boxSizing: 'border-box', overflow: 'hidden'}}>
                {this.props.editorTools}
                <div data-testid="bw-tilemap-palette-state" data-palette-kind={this.state.palette.kind} role="status"
                    style={{fontSize: 12, flexShrink: 0}}>
                    {this.state.palette.kind === 'unavailable' ? t(locale, 'tm.paletteUnavailable',
                        {error: this.state.palette.errorMessage}) :
                        !this.state.palette.colors ? t(locale, 'tm.paletteUnknown') :
                        this.state.palette.laterChanges ? t(locale, 'tm.paletteStartup') : null}
                </div>
                <LegacyTileDefinitionEditor vm={this.props.vm} locale={locale} palette={this.state.palette} />
                <div role="toolbar" style={{display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap'}}>
                    <select data-testid="bw-tilemap-select" aria-label={t(locale, 'tm.map')} value={selected}
                        onChange={event => this.selectMap(Number(event.target.value))}>
                        {maps.map((map, i) => <option key={map.blockId} value={i} disabled={!map.editable}>{mapName(map, i)}</option>)}
                    </select>
                    {(legacy ? ['paint', 'erase', 'fill'] : ['paint', 'erase', 'fill', 'wall', 'place']).map(name => (
                        <button key={name} type="button" data-testid={`bw-tilemap-tool-${name}`} aria-pressed={tool === name}
                            style={btn(tool === name)} onClick={() => this.setState({tool: name})}>
                            {t(locale, `tm.${name}`)}</button>
                    ))}
                    {!legacy ? <label style={label}><input type="checkbox" data-testid="bw-tilemap-show-walls" checked={showWalls}
                        onChange={event => this.setState({showWalls: event.target.checked})} />{t(locale, 'tm.showWalls')}</label> : null}
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
                    <label style={label}>{t(locale, 'tm.columns')}<input type="number" min={1} max={legacy ? 160 : 255} style={{width: 56}}
                        data-testid="bw-tilemap-columns" value={columns} onChange={event => this.setState({columns: Number(event.target.value)})} /></label>
                    <label style={label}>{t(locale, 'tm.rows')}<input type="number" min={1} max={legacy ? 160 : 255} style={{width: 56}}
                        data-testid="bw-tilemap-rows" value={rows} onChange={event => this.setState({rows: Number(event.target.value)})} /></label>
                    <button type="button" data-testid="bw-tilemap-resize" style={btn(false)}
                        onClick={() => this.apply(resizeTilemap(data, columns, rows))}>{t(locale, 'tm.resize')}</button>
                    <label style={label}>{t(locale, 'tm.tileSize')}<select data-testid="bw-tilemap-tile-size" disabled={legacy} value={data.tileSize}
                        onChange={event => this.apply(setTileSize(data, Number(event.target.value)))}>
                        {TILE_SIZES.map(size => <option key={size} value={size}>{size}×{size}</option>)}</select></label>
                    <span style={{flex: 1}} />
                    {this.hasUnsavedChanges() ? <span style={{fontSize: 12, color: '#b45309'}}>{t(locale, 'tm.unsaved')}</span> : null}
                    <button type="button" data-testid="bw-tilemap-revert" style={btn(false)} disabled={!this.hasUnsavedChanges()}
                        onClick={() => this.setState(state => ({history: commit(state.history, state.saved),
                            placementDraft: state.placements}))}>{t(locale, 'tm.revert')}</button>
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
                                    title={image.displayName || image.tileId || (i ? t(locale, 'tm.tile', {n: i}) : t(locale, 'tm.emptyTile'))}
                                    onClick={() => this.setState({tile: i, tileNameDraft: null, tool: tool === 'wall' ? 'paint' : tool})}
                                    style={{...btn(tile === i), width: 40, height: 40, padding: 2}}>
                                    <TileSwatch image={image} palette={this.state.palette} />
                                </button>
                            ))}
                        </div>
                        {legacy ? <p data-testid="bw-tilemap-legacy-hint" style={{fontSize: 12}}>{t(locale, 'tm.legacyLayout')}</p> : <>
                        <div style={{display: 'flex', gap: 4}}>
                            <button type="button" data-testid="bw-tilemap-add-tile" style={btn(false)} onClick={() => {
                                const added = addTile(data);
                                if (added.index < 0) return;
                                this.setState(state => ({history: commit(state.history, added.data), tile: added.index}));
                            }}>{t(locale, 'tm.addTile')}</button>
                            <button type="button" data-testid="bw-tilemap-remove-tile" style={btn(false)} disabled={tile < 1}
                                onClick={() => this.apply(removeTile(data, tile))}>{t(locale, 'tm.removeTile')}</button>
                        </div>
                        <label style={label}>{t(locale, 'tm.tileName')}
                            <input data-testid="bw-tilemap-tile-name" maxLength={128}
                                value={this.state.tileNameDraft === null ? (data.images[tile]?.displayName || '') : this.state.tileNameDraft}
                                onChange={event => this.setState({tileNameDraft: event.target.value})}
                                onBlur={() => this.commitTileName()}
                                onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                style={{width: '100%', minWidth: 0, boxSizing: 'border-box'}} />
                        </label>
                        {tile > 0 ? (
                            <>
                                <canvas ref={this.tileCanvas} data-testid="bw-tilemap-tile-canvas"
                                    style={{imageRendering: 'pixelated', width: 192, height: 192, touchAction: 'none', border: '1px solid #cbd5e1'}}
                                    onPointerDown={this.handleTilePointerDown} onContextMenu={event => event.preventDefault()} />
                                <div style={{display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2}}>
                                    {Array.from({length: 16}, (_, i) => (
                                        <button key={i} type="button" data-testid={`bw-tilemap-colour-${i}`} aria-pressed={colour === i}
                                            title={t(locale, 'tm.colour', {n: i})} onClick={() => this.setState({colour: i})}
                                            style={{height: 22, borderRadius: 3, cursor: 'pointer',
                                                border: colour === i ? '2px solid #0f172a' : '1px solid #cbd5e1',
                                                background: tilemapPixelColor(this.state.palette, i) || 'repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 50% / 8px 8px'}} />
                                    ))}
                                </div>
                            </>
                        ) : null}
                        </>}
                        {tool === 'wall' ? <p style={{fontSize: 12, color: '#64748b', margin: 0}}>{t(locale, 'tm.wallHint')}</p> : null}
                        {legacy ? null : this.renderPlacements(locale, btn, label, data)}
                    </div>
                </div>
                <div data-testid="bw-tilemap-status" role="status" style={{fontSize: 12, color: '#334155', minHeight: 16}}>{status}</div>
            </div>
        );
    }
}

/** A tile drawn small for the palette. */
const TileSwatch = ({image, palette}) => {
    const ref = React.useRef(null);
    React.useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, image.width, image.height);
        drawTilemapImage(ctx, image, 0, 0, 1, palette);
    }, [image, palette]);
    return <canvas ref={ref} style={{width: '100%', height: '100%', imageRendering: 'pixelated'}} />;
};
TileSwatch.propTypes = {image: PropTypes.object.isRequired, palette: PropTypes.object.isRequired};

TilemapEditor.propTypes = {
    editorTools: PropTypes.node,
    locale: PropTypes.string,
    vm: PropTypes.object.isRequired
};

export default TilemapEditor;
