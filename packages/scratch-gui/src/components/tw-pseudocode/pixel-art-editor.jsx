/**
 * A palette-locked pixel editor for a costume — the MakeCode Arcade way of
 * drawing sprites (16 colours, index 0 transparent), inside the costume tab.
 *
 * scratch-paint edits vectors and free bitmaps; it has no grid and no palette
 * lock, so Arcade art imported as pixels could not be edited AS pixels. This
 * edits the palette image (lib/bw-makecode/pixel-image.js) and saves it back
 * through vm.updateSvg as our rect-SVG costume — pixel-exact on the stage,
 * readable back exactly, and the form the Arcade export reads.
 *
 * A costume that is not pixel art (a vector drawing, a photo) is converted on
 * open — rasterized and matched to the palette at the chosen size — and the
 * editor says so, because that conversion is lossy and nothing about it should
 * look silent. Nothing is written until Save.
 */
import PropTypes from 'prop-types';
import React from 'react';
import downloadBlob from '../../lib/download-blob.js';
import {makeT, browserLocale} from '../../lib/bw-i18n.js';
import {getCostumeDocument, setCostumeDocument} from '../../lib/bw-artwork-bundle.js';
import {blankLayer, clearSelectedPixels, composeLayers, containsCell, layersDocument, layersToSvg,
    moveSelectedPixels, resizeLayers, selectionRect, sourceLayers, transformPixels} from '../../lib/bw-pixel-layers.js';
import {
    ARCADE_PALETTE, svgToPixels, quantizeRgba, floodFill
} from '../../lib/bw-makecode/pixel-image.js';

const L10N = {
    en: {
        'px.pencil': 'Pencil', 'px.fill': 'Fill', 'px.erase': 'Eraser', 'px.pick': 'Pick colour',
        'px.size': 'Size', 'px.save': 'Save', 'px.revert': 'Revert', 'px.saved': 'Saved to the costume.',
        'px.converted': 'This costume was not pixel art: it was converted to {w}×{h} palette pixels. Saving replaces it.',
        'px.reconvert': 'Convert at this size', 'px.none': 'Select a costume to edit.',
        'px.transparent': 'Transparent', 'px.hand': 'Pan', 'px.undo': 'Undo', 'px.redo': 'Redo',
        'px.zoom': 'Zoom', 'px.line': 'Line', 'px.rect': 'Rectangle', 'px.mirror': 'Mirror',
        'px.layers': 'Layers', 'px.addLayer': 'Add layer', 'px.deleteLayer': 'Delete layer',
        'px.showLayer': 'Show layer', 'px.hideLayer': 'Hide layer', 'px.layerUp': 'Move up',
        'px.layerDown': 'Move down', 'px.lockLayer': 'Lock layer', 'px.unlockLayer': 'Unlock layer',
        'px.select': 'Select', 'px.move': 'Move selection', 'px.clearSelection': 'Clear selection',
        'px.deselect': 'Deselect', 'px.opacity': 'Opacity', 'px.renameLayer': 'Rename layer',
        'px.exportPng': 'Export transparent PNG', 'px.circle': 'Circle',
        'px.flipH': 'Flip horizontally', 'px.flipV': 'Flip vertically',
        'px.rotateCW': 'Rotate clockwise', 'px.rotateCCW': 'Rotate counterclockwise'
    },
    de: {
        'px.pencil': 'Stift', 'px.fill': 'Füllen', 'px.erase': 'Radierer', 'px.pick': 'Farbe aufnehmen',
        'px.size': 'Größe', 'px.save': 'Speichern', 'px.revert': 'Verwerfen', 'px.saved': 'Im Kostüm gespeichert.',
        'px.converted': 'Dieses Kostüm war keine Pixelgrafik: Es wurde in {w}×{h} Palettenpixel umgewandelt. Speichern ersetzt es.',
        'px.reconvert': 'In dieser Größe umwandeln', 'px.none': 'Ein Kostüm zum Bearbeiten auswählen.',
        'px.transparent': 'Transparent', 'px.hand': 'Verschieben', 'px.undo': 'Rückgängig',
        'px.redo': 'Wiederholen', 'px.zoom': 'Zoom', 'px.line': 'Linie', 'px.rect': 'Rechteck',
        'px.mirror': 'Spiegeln', 'px.layers': 'Ebenen', 'px.addLayer': 'Ebene hinzufügen',
        'px.deleteLayer': 'Ebene löschen', 'px.showLayer': 'Ebene zeigen', 'px.hideLayer': 'Ebene ausblenden',
        'px.layerUp': 'Nach oben', 'px.layerDown': 'Nach unten', 'px.lockLayer': 'Ebene sperren',
        'px.unlockLayer': 'Ebene entsperren', 'px.select': 'Auswählen',
        'px.move': 'Auswahl verschieben', 'px.clearSelection': 'Auswahl löschen',
        'px.deselect': 'Auswahl aufheben', 'px.opacity': 'Deckkraft',
        'px.renameLayer': 'Ebene umbenennen', 'px.exportPng': 'Transparentes PNG exportieren',
        'px.circle': 'Kreis', 'px.flipH': 'Horizontal spiegeln', 'px.flipV': 'Vertikal spiegeln',
        'px.rotateCW': 'Im Uhrzeigersinn drehen', 'px.rotateCCW': 'Gegen den Uhrzeigersinn drehen'
    }
};
const t = makeT(L10N);

/** The costume's RGBA at its natural size, via an <img> and a canvas. */
const rasterize = costume => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
        const w = Math.max(1, img.naturalWidth);
        const h = Math.max(1, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve({rgba: ctx.getImageData(0, 0, w, h).data, w, h});
    };
    img.onerror = () => reject(new Error('the costume could not be drawn'));
    img.src = costume.asset.encodeDataURI();
});

class PixelArtEditor extends React.Component {
    constructor (props) {
        super(props);
        this.state = {image: null, layers: [], activeLayerId: null, original: null,
            scale: 4, zoom: 1, colour: 2, tool: 'pencil',
            mirror: false, converted: false, selection: null,
            status: '', w: 16, h: 16, renamingLayerId: null, renameValue: ''};
        this.canvas = React.createRef();
        this.viewport = React.createRef();
        this.root = React.createRef();
        this.drawing = false;
        this.strokeRecorded = false;
        this.pointers = new Map();
        this.undoStack = [];
        this.redoStack = [];
        this.opacityGesture = false;
        this.renameCommitted = false;
        this.lastCell = null;
        this.shapeStart = null;
        this.shapeBase = null;
        this.selectionBeforeGesture = null;
        this.gesture = null;
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.undo = this.undo.bind(this);
        this.redo = this.redo.bind(this);
        this.save = this.save.bind(this);
        this.exportPng = this.exportPng.bind(this);
        this.revert = this.revert.bind(this);
        this.addLayer = this.addLayer.bind(this);
        this.transform = this.transform.bind(this);
    }

    componentDidMount () { this.load(); }

    componentDidUpdate (prev, prevState) {
        if (prev.costumeIndex !== this.props.costumeIndex || this.loadedCostume !== this.costume()) this.load();
        else if (prevState.image !== this.state.image || prevState.selection !== this.state.selection) this.paint();
    }

    costume () {
        const target = this.props.vm && this.props.vm.editingTarget;
        return target && target.sprite && target.sprite.costumes[this.props.costumeIndex];
    }

    async load (size) {
        const costume = this.costume();
        this.loadedCostume = costume;
        if (!costume) { this.setState({image: null}); return; }
        let image = null;
        let layers = null;
        let scale = 4;
        const document = getCostumeDocument(costume);
        const first = document?.layers?.[0];
        if (!size && first?.type === 'pixel' && first.content.kind === 'pixels') {
            const {width, height} = first.content.value;
            layers = sourceLayers(document, width, height);
            if (layers) {
                image = composeLayers(layers, width, height);
                scale = document.pixelScale || 4;
            }
        }
        if (!image && !size && costume.asset.dataFormat === 'svg') {
            const px = svgToPixels(costume.asset.decodeText());
            if (px) {
                image = {width: px.width, height: px.height, pixels: px.pixels};
                scale = px.scale;
            }
        }
        let converted = false;
        if (!image) {
            const {rgba, w, h} = await rasterize(costume);
            const tw = size ? size.w : Math.min(64, Math.max(4, Math.round(w / 4)));
            const th = size ? size.h : Math.min(64, Math.max(4, Math.round(h / 4)));
            image = quantizeRgba(rgba, w, h, tw, th);
            converted = true;
        }
        if (!layers) layers = [{...blankLayer('pixels', 'Pixels', image.width, image.height),
            pixels: image.pixels}];
        const activeLayerId = layers.some(layer => layer.id === document?.activeLayerId) ?
            document.activeLayerId : layers[layers.length - 1].id;
        this.undoStack = [];
        this.redoStack = [];
        this.setState({image, layers, activeLayerId, selection: null, renamingLayerId: null, renameValue: '',
            original: {layers, activeLayerId, selection: null, w: image.width, h: image.height},
            scale, zoom: 1, converted, status: '',
            w: image.width, h: image.height});
    }

    cellSize () {
        const {image} = this.state;
        return image ? Math.max(4, Math.min(24, Math.floor(384 / Math.max(image.width, image.height)))) : 16;
    }

    paint () {
        const canvas = this.canvas.current;
        const {image} = this.state;
        if (!canvas || !image) return;
        const c = this.cellSize();
        canvas.width = image.width * c;
        canvas.height = image.height * c;
        const ctx = canvas.getContext('2d');
        for (let y = 0; y < image.height; y++) {
            for (let x = 0; x < image.width; x++) {
                ctx.fillStyle = ((x + y) % 2) ? '#e2e8f0' : '#f8fafc';
                ctx.fillRect(x * c, y * c, c, c);
            }
        }
        this.paintLayers(ctx, c);
        ctx.strokeStyle = 'rgba(15,23,42,0.12)';
        for (let x = 0; x <= image.width; x++) { ctx.beginPath(); ctx.moveTo(x * c + 0.5, 0); ctx.lineTo(x * c + 0.5, canvas.height); ctx.stroke(); }
        for (let y = 0; y <= image.height; y++) { ctx.beginPath(); ctx.moveTo(0, y * c + 0.5); ctx.lineTo(canvas.width, y * c + 0.5); ctx.stroke(); }
        const {selection} = this.state;
        if (selection) {
            ctx.save();
            ctx.setLineDash([Math.max(2, c / 3), Math.max(2, c / 3)]);
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2;
            ctx.strokeRect((selection.x * c) + 1, (selection.y * c) + 1,
                (selection.width * c) - 2, (selection.height * c) - 2);
            ctx.restore();
        }
    }

    paintLayers (ctx, c) {
        const {image, layers} = this.state;
        for (const layer of layers) {
            if (!layer.visible || layer.opacity <= 0) continue;
            ctx.globalAlpha = layer.opacity;
            for (let y = 0; y < image.height; y++) {
                for (let x = 0; x < image.width; x++) {
                    const colour = ARCADE_PALETTE[layer.pixels[(y * image.width) + x]];
                    if (!colour) continue;
                    ctx.fillStyle = colour;
                    ctx.fillRect(x * c, y * c, c, c);
                }
            }
        }
        ctx.globalAlpha = 1;
    }

    cellAt (event) {
        const rect = this.canvas.current.getBoundingClientRect();
        const c = this.cellSize() * (rect.width / this.canvas.current.width);
        const x = Math.floor((event.clientX - rect.left) / c);
        const y = Math.floor((event.clientY - rect.top) / c);
        const {image} = this.state;
        return x >= 0 && y >= 0 && x < image.width && y < image.height ? [x, y] : null;
    }

    remember () {
        if (!this.state.image) return;
        this.undoStack.push({layers: this.state.layers, activeLayerId: this.state.activeLayerId,
            selection: this.state.selection,
            w: this.state.w, h: this.state.h});
        if (this.undoStack.length > 80) this.undoStack.shift();
        this.redoStack = [];
    }

    undo () {
        if (!this.undoStack.length) return;
        this.redoStack.push({layers: this.state.layers, activeLayerId: this.state.activeLayerId,
            selection: this.state.selection,
            w: this.state.w, h: this.state.h});
        this.restore(this.undoStack.pop());
    }

    redo () {
        if (!this.redoStack.length) return;
        this.undoStack.push({layers: this.state.layers, activeLayerId: this.state.activeLayerId,
            selection: this.state.selection,
            w: this.state.w, h: this.state.h});
        this.restore(this.redoStack.pop());
    }

    restore (snapshot) {
        this.setState({...snapshot, image: composeLayers(snapshot.layers, snapshot.w, snapshot.h), status: ''});
    }

    activeLayer () {
        return this.state.layers.find(layer => layer.id === this.state.activeLayerId);
    }

    updateActive (pixels) {
        this.setState(state => {
            const layers = state.layers.map(layer => layer.id === state.activeLayerId ? {...layer, pixels} : layer);
            return {layers, image: composeLayers(layers, state.w, state.h), status: ''};
        });
    }

    clearSelection () {
        const {selection, w} = this.state;
        const active = this.activeLayer();
        if (!selection || !active || !active.visible || active.locked) return;
        this.remember();
        this.updateActive(clearSelectedPixels(active.pixels, w, selection));
    }

    updateSelection (event) {
        const end = this.cellAt(event);
        if (end && this.shapeStart) this.setState({selection: selectionRect(this.shapeStart, end)});
    }

    updateMove (event) {
        const end = this.cellAt(event);
        if (!end || !this.shapeStart || !this.shapeBase || !this.selectionBeforeGesture) return;
        const {w, h} = this.state;
        const moved = moveSelectedPixels(this.shapeBase.pixels, w, h, this.selectionBeforeGesture,
            end[0] - this.shapeStart[0], end[1] - this.shapeStart[1]);
        this.setState({selection: moved.selection});
        this.updateActive(moved.pixels);
    }

    apply (event) {
        const cell = this.cellAt(event);
        if (!cell) return;
        const [x, y] = cell;
        const {image, tool, colour, mirror} = this.state;
        const k = (y * image.width) + x;
        if (tool === 'pick') { this.setState({colour: image.pixels[k], tool: 'pencil'}); return; }
        const active = this.activeLayer();
        if (!active || active.locked || !active.visible) return;
        if (tool === 'fill') {
            this.setState(state => {
                let filled = floodFill({width: state.w, height: state.h, pixels: active.pixels}, x, y, colour);
                if (mirror) filled = floodFill(filled, filled.width - 1 - x, y, colour);
                const layers = state.layers.map(layer => layer.id === state.activeLayerId ?
                    {...layer, pixels: filled.pixels} : layer);
                return {layers, image: composeLayers(layers, state.w, state.h), status: ''};
            });
            return;
        }
        const value = tool === 'erase' ? 0 : colour;
        const previous = this.lastCell || cell;
        this.setState(state => {
            const current = state.layers.find(layer => layer.id === state.activeLayerId);
            if (!current || current.locked || !current.visible) return null;
            const pixels = new Uint8Array(current.pixels);
            const plot = (px, py) => {
                pixels[(py * state.w) + px] = value;
                if (mirror) pixels[(py * state.w) + state.w - 1 - px] = value;
            };
            let x0 = previous[0];
            let y0 = previous[1];
            const dx = Math.abs(x - x0);
            const dy = -Math.abs(y - y0);
            const sx = x0 < x ? 1 : -1;
            const sy = y0 < y ? 1 : -1;
            let error = dx + dy;
            while (true) {
                plot(x0, y0);
                if (x0 === x && y0 === y) break;
                const doubled = 2 * error;
                if (doubled >= dy) { error += dy; x0 += sx; }
                if (doubled <= dx) { error += dx; y0 += sy; }
            }
            const layers = state.layers.map(layer => layer.id === state.activeLayerId ? {...layer, pixels} : layer);
            return {layers, image: composeLayers(layers, state.w, state.h), status: ''};
        });
        this.lastCell = cell;
    }

    applyShape (event) {
        const end = this.cellAt(event);
        if (!end || !this.shapeStart || !this.shapeBase) return;
        const {width, height} = this.shapeBase;
        const pixels = new Uint8Array(this.shapeBase.pixels);
        const value = this.state.colour;
        const plot = (x, y) => {
            if (x < 0 || y < 0 || x >= width || y >= height) return;
            pixels[(y * width) + x] = value;
            if (this.state.mirror) pixels[(y * width) + width - 1 - x] = value;
        };
        const [x1, y1] = end;
        const [startX, startY] = this.shapeStart;
        if (this.state.tool === 'rect') {
            const left = Math.min(startX, x1);
            const right = Math.max(startX, x1);
            const top = Math.min(startY, y1);
            const bottom = Math.max(startY, y1);
            for (let x = left; x <= right; x++) { plot(x, top); plot(x, bottom); }
            for (let y = top; y <= bottom; y++) { plot(left, y); plot(right, y); }
        } else if (this.state.tool === 'circle') {
            const cx = (startX + x1) / 2;
            const cy = (startY + y1) / 2;
            const rx = Math.abs(x1 - startX) / 2;
            const ry = Math.abs(y1 - startY) / 2;
            // Dense sampling gives an unbroken one-pixel outline even for
            // small and narrow circles, including a one-cell drag.
            const steps = Math.max(1, 16 * Math.max(Math.abs(x1 - startX), Math.abs(y1 - startY)));
            for (let step = 0; step < steps; step++) {
                const angle = (step * 2 * Math.PI) / steps;
                plot(Math.round(cx + rx * Math.cos(angle)), Math.round(cy + ry * Math.sin(angle)));
            }
        } else {
            let x = startX;
            let y = startY;
            const dx = Math.abs(x1 - x);
            const dy = -Math.abs(y1 - y);
            const sx = x < x1 ? 1 : -1;
            const sy = y < y1 ? 1 : -1;
            let error = dx + dy;
            while (true) {
                plot(x, y);
                if (x === x1 && y === y1) break;
                const doubled = 2 * error;
                if (doubled >= dy) { error += dy; x += sx; }
                if (doubled <= dx) { error += dx; y += sy; }
            }
        }
        this.updateActive(pixels);
    }

    midpoint () {
        const points = [...this.pointers.values()];
        const [a, b] = points;
        return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
            distance: Math.hypot(a.x - b.x, a.y - b.y)};
    }

    onPointerDown (event) {
        this.root.current?.focus({preventScroll: true});
        event.currentTarget.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
        if (this.pointers.size === 2) {
            // A second finger turns the stroke into navigation. Remove the initial dot.
            if (this.drawing && this.strokeRecorded && this.undoStack.length) {
                this.restore(this.undoStack.pop());
            } else if (this.drawing && this.shapeStart) {
                this.setState({selection: this.selectionBeforeGesture});
            }
            this.drawing = false;
            this.strokeRecorded = false;
            this.shapeStart = null;
            this.shapeBase = null;
            this.selectionBeforeGesture = null;
            const point = this.midpoint();
            const viewport = this.viewport.current;
            const rect = viewport.getBoundingClientRect();
            this.gesture = {distance: point.distance, zoom: this.state.zoom,
                anchorX: (point.x - rect.left + viewport.scrollLeft) / this.state.zoom,
                anchorY: (point.y - rect.top + viewport.scrollTop) / this.state.zoom};
            return;
        }
        if (this.pointers.size !== 1) return;
        if (this.state.tool === 'hand') {
            this.gesture = {x: event.clientX, y: event.clientY,
                scrollLeft: this.viewport.current.scrollLeft, scrollTop: this.viewport.current.scrollTop};
            return;
        }
        const active = this.activeLayer();
        const cell = this.cellAt(event);
        if (!cell) return;
        if (this.state.tool === 'select' || (this.state.tool === 'move' &&
            !containsCell(this.state.selection, cell[0], cell[1]))) {
            this.drawing = true;
            this.strokeRecorded = false;
            this.selectionBeforeGesture = this.state.selection;
            this.shapeStart = cell;
            this.setState({selection: selectionRect(cell, cell)});
            return;
        }
        if (this.state.tool !== 'pick' && (!active || active.locked || !active.visible)) return;
        this.strokeRecorded = this.state.tool !== 'pick';
        if (this.strokeRecorded) this.remember();
        this.drawing = true;
        this.lastCell = null;
        if (this.state.tool === 'move') {
            this.shapeStart = cell;
            this.shapeBase = {pixels: active.pixels};
            this.selectionBeforeGesture = this.state.selection;
        } else if (['line', 'rect', 'circle'].includes(this.state.tool)) {
            this.shapeStart = cell;
            this.shapeBase = {width: this.state.w, height: this.state.h, pixels: active.pixels};
            this.applyShape(event);
        } else this.apply(event);
    }

    onPointerMove (event) {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
        const viewport = this.viewport.current;
        if (this.pointers.size >= 2 && this.gesture?.distance) {
            const point = this.midpoint();
            const zoom = Math.max(0.5, Math.min(8, this.gesture.zoom *
                (point.distance / Math.max(1, this.gesture.distance))));
            const rect = viewport.getBoundingClientRect();
            this.setState({zoom}, () => {
                viewport.scrollLeft = (this.gesture.anchorX * zoom) - (point.x - rect.left);
                viewport.scrollTop = (this.gesture.anchorY * zoom) - (point.y - rect.top);
            });
        } else if (this.state.tool === 'hand' && this.gesture) {
            viewport.scrollLeft = this.gesture.scrollLeft + this.gesture.x - event.clientX;
            viewport.scrollTop = this.gesture.scrollTop + this.gesture.y - event.clientY;
        } else if (this.drawing && ['pencil', 'erase'].includes(this.state.tool)) this.apply(event);
        else if (this.drawing && ['line', 'rect', 'circle'].includes(this.state.tool)) this.applyShape(event);
        else if (this.drawing && this.shapeBase && this.state.tool === 'move') this.updateMove(event);
        else if (this.drawing && this.shapeStart) this.updateSelection(event);
    }

    onPointerUp (event) {
        this.pointers.delete(event.pointerId);
        this.drawing = false;
        this.strokeRecorded = false;
        this.lastCell = null;
        this.shapeStart = null;
        this.shapeBase = null;
        this.selectionBeforeGesture = null;
        this.gesture = null;
    }

    onWheel (event) {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const viewport = this.viewport.current;
        const rect = viewport.getBoundingClientRect();
        const anchorX = (event.clientX - rect.left + viewport.scrollLeft) / this.state.zoom;
        const anchorY = (event.clientY - rect.top + viewport.scrollTop) / this.state.zoom;
        const zoom = Math.max(0.5, Math.min(8, this.state.zoom * Math.exp(-event.deltaY / 150)));
        this.setState({zoom}, () => {
            viewport.scrollLeft = (anchorX * zoom) - (event.clientX - rect.left);
            viewport.scrollTop = (anchorY * zoom) - (event.clientY - rect.top);
        });
    }

    handleKeyDown (event) {
        if (event.target.closest('input, textarea, [contenteditable]')) return;
        if (event.key === 'Escape' && this.state.selection) {
            event.preventDefault();
            this.setState({selection: null});
            return;
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && this.state.selection) {
            event.preventDefault();
            this.clearSelection();
            return;
        }
        if (!event.metaKey && !event.ctrlKey && !event.altKey) {
            const shortcuts = {h: 'flip-h', v: 'flip-v', ']': 'rotate-cw', '[': 'rotate-ccw'};
            const operation = shortcuts[event.key.toLowerCase()];
            if (operation) {
                event.preventDefault();
                this.transform(operation);
            } else if (event.key.toLowerCase() === 'c') this.setState({tool: 'circle'});
            return;
        }
        if (!(event.metaKey || event.ctrlKey)) return;
        const key = event.key.toLowerCase();
        if (key !== 'z' && key !== 'y') return;
        event.preventDefault();
        event.stopPropagation();
        if (key === 'y' || event.shiftKey) this.redo();
        else this.undo();
    }

    resize (w, h) {
        const W = Math.max(1, Math.min(128, w | 0));
        const H = Math.max(1, Math.min(128, h | 0));
        if (W === this.state.w && H === this.state.h) return;
        this.remember();
        this.setState(state => {
            const layers = resizeLayers(state.layers, state.w, state.h, W, H);
            return {layers, image: composeLayers(layers, W, H), w: W, h: H,
                selection: null, status: ''};
        });
    }

    transform (operation) {
        const {layers, activeLayerId, selection, w, h} = this.state;
        const active = layers.find(layer => layer.id === activeLayerId);
        if (!active || active.locked || !active.visible) return;
        const turn = operation === 'rotate-cw' || operation === 'rotate-ccw';
        if (turn && !selection && layers.some(layer => layer.locked)) return;
        const transformed = transformPixels(active.pixels, w, h, selection, operation);
        if (!transformed) return;
        this.remember();
        const next = layers.map(layer => {
            if (selection && layer.id !== activeLayerId) return layer;
            if (!selection && !turn && layer.id !== activeLayerId) return layer;
            const result = layer.id === activeLayerId ? transformed :
                transformPixels(layer.pixels, w, h, null, operation);
            return {...layer, pixels: result.pixels};
        });
        this.setState({layers: next, image: composeLayers(next, transformed.width, transformed.height),
            w: transformed.width, h: transformed.height, selection: transformed.selection, status: ''});
    }

    addLayer () {
        const {w, h, layers} = this.state;
        this.remember();
        const id = `pixels-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const layer = blankLayer(id, `${t(this.props.locale || browserLocale(), 'px.layers')} ${layers.length + 1}`, w, h);
        this.setState(state => {
            const index = state.layers.findIndex(item => item.id === state.activeLayerId);
            const next = state.layers.slice();
            next.splice(index + 1, 0, layer);
            return {layers: next, activeLayerId: id, selection: null,
                image: composeLayers(next, w, h), status: ''};
        });
    }

    changeLayer (id, change) {
        this.remember();
        this.setState(state => {
            const layers = state.layers.map(layer => layer.id === id ? {...layer, ...change} : layer);
            return {layers, image: composeLayers(layers, state.w, state.h), status: ''};
        });
    }

    beginOpacityGesture () {
        if (this.opacityGesture) return;
        this.remember();
        this.opacityGesture = true;
    }

    setLayerOpacity (id, value) {
        this.beginOpacityGesture();
        this.setState(state => {
            const layers = state.layers.map(layer => layer.id === id ? {...layer, opacity: value} : layer);
            return {layers, image: composeLayers(layers, state.w, state.h), status: ''};
        });
    }

    startLayerRename (layer) {
        this.renameCommitted = false;
        this.setState({renamingLayerId: layer.id, renameValue: layer.name});
    }

    finishLayerRename (id, save) {
        if (this.renameCommitted || this.state.renamingLayerId !== id) return;
        this.renameCommitted = true;
        const name = this.state.renameValue.trim();
        const layer = this.state.layers.find(item => item.id === id);
        if (save && name && layer && name !== layer.name) this.changeLayer(id, {name});
        this.setState({renamingLayerId: null, renameValue: ''});
    }

    moveLayer (id, offset) {
        const index = this.state.layers.findIndex(layer => layer.id === id);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= this.state.layers.length) return;
        this.remember();
        this.setState(state => {
            const layers = state.layers.slice();
            [layers[index], layers[target]] = [layers[target], layers[index]];
            return {layers, image: composeLayers(layers, state.w, state.h), status: ''};
        });
    }

    deleteLayer (id) {
        if (this.state.layers.length <= 1) return;
        this.remember();
        this.setState(state => {
            const layers = state.layers.filter(layer => layer.id !== id);
            const activeLayerId = state.activeLayerId === id ? layers[layers.length - 1].id : state.activeLayerId;
            return {layers, activeLayerId, selection: null,
                image: composeLayers(layers, state.w, state.h), status: ''};
        });
    }

    save () {
        const {image, scale, layers, activeLayerId} = this.state;
        const vm = this.props.vm;
        if (!image || !vm) return;
        const svg = layersToSvg(layers, image.width, image.height, scale);
        vm.updateSvg(this.props.costumeIndex, svg, (image.width * scale) / 2, (image.height * scale) / 2);
        setCostumeDocument(this.costume(), layersDocument(layers, image.width, image.height, scale, activeLayerId));
        this.setState({original: {layers, activeLayerId, selection: null,
            w: image.width, h: image.height},
            converted: false, status: 'saved'});
    }

    exportPng () {
        const {image, scale} = this.state;
        if (!image) return;
        const canvas = document.createElement('canvas');
        canvas.width = image.width * scale;
        canvas.height = image.height * scale;
        this.paintLayers(canvas.getContext('2d'), scale);
        const name = (this.costume()?.name || 'costume').replace(/[\\/:*?"<>|]/g, '_');
        canvas.toBlob(blob => {
            if (blob) downloadBlob(`${name}.png`, blob);
        }, 'image/png');
    }

    revert () {
        const {original} = this.state;
        if (original) this.restore(original);
    }

    render () {
        const locale = this.props.locale || browserLocale();
        const {image, layers, activeLayerId, selection, colour, tool, mirror, converted, status, w, h, zoom,
            renamingLayerId, renameValue} =
            this.state;
        if (!image) return <div style={{padding: 24, color: '#64748b'}}>{t(locale, 'px.none')}</div>;
        const activeLayer = layers.find(layer => layer.id === activeLayerId);
        const btn = active => ({padding: '8px 10px', minHeight: 44, borderRadius: 6, fontSize: 12, cursor: 'pointer',
            border: `1px solid ${active ? '#4c97ff' : '#cbd5e1'}`, background: active ? '#e0edff' : '#fff'});
        return (
            <div ref={this.root} data-testid="bw-pixel-editor" tabIndex={0}
                onKeyDown={this.handleKeyDown}
                style={{display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
                    height: '100%', boxSizing: 'border-box', overflow: 'auto'}}>
                <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center'}}>
                    {this.props.editorTools}
                    {['pencil', 'line', 'rect', 'circle', 'select', 'move', 'fill', 'erase', 'pick', 'hand'].map(k => (
                        <button key={k} type="button" style={btn(tool === k)} data-testid={`bw-pixel-tool-${k}`}
                            onClick={() => this.setState({tool: k})}>{t(locale, `px.${k}`)}</button>
                    ))}
                    <button type="button" style={btn(mirror)} aria-pressed={mirror}
                        onClick={() => this.setState({mirror: !mirror})}>{t(locale, 'px.mirror')}</button>
                    <span style={{fontSize: 12, marginLeft: 8}}>{t(locale, 'px.size')}</span>
                    <input type="number" min="1" max="128" value={w} style={{width: 52}} data-testid="bw-pixel-w"
                        onChange={e => this.resize(Number(e.target.value), h)} />
                    <span style={{fontSize: 12}}>×</span>
                    <input type="number" min="1" max="128" value={h} style={{width: 52}} data-testid="bw-pixel-h"
                        onChange={e => this.resize(w, Number(e.target.value))} />
                    {converted ? (
                        <button type="button" style={btn(false)} onClick={() => this.load({w, h})}>{t(locale, 'px.reconvert')}</button>
                    ) : null}
                    <button type="button" style={btn(false)} disabled={!this.undoStack.length}
                        onClick={this.undo}>{t(locale, 'px.undo')}</button>
                    <button type="button" style={btn(false)} disabled={!this.redoStack.length}
                        onClick={this.redo}>{t(locale, 'px.redo')}</button>
                    {selection ? <button type="button" style={btn(false)} onClick={() => this.clearSelection()}
                        data-testid="bw-pixel-clear-selection">{t(locale, 'px.clearSelection')}</button> : null}
                    {selection ? <button type="button" style={btn(false)} onClick={() => this.setState({selection: null})}>
                        {t(locale, 'px.deselect')}</button> : null}
                    {[
                        ['flip-h', 'px.flipH', '↔'], ['flip-v', 'px.flipV', '↕'],
                        ['rotate-ccw', 'px.rotateCCW', '↶'], ['rotate-cw', 'px.rotateCW', '↷']
                    ].map(([operation, label, symbol]) =>
                        <button key={operation} type="button" style={btn(false)}
                            data-testid={`bw-pixel-${operation}`} aria-label={t(locale, label)}
                            title={t(locale, label)}
                            disabled={!activeLayer || activeLayer.locked || !activeLayer.visible ||
                                (operation.startsWith('rotate') && !selection && layers.some(layer => layer.locked)) ||
                                (operation.startsWith('rotate') && selection &&
                                (selection.height > w || selection.width > h))}
                            onClick={() => this.transform(operation)}>{symbol}</button>)}
                    <span style={{fontSize: 12}}>{t(locale, 'px.zoom')} {Math.round(zoom * 100)}%</span>
                </div>
                <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}} role="radiogroup">
                    {ARCADE_PALETTE.map((c, i) => (
                        <button key={i} type="button" role="radio" aria-checked={colour === i}
                            title={c || t(locale, 'px.transparent')} data-testid={`bw-pixel-colour-${i}`}
                            onClick={() => this.setState({colour: i, tool: tool === 'pick' ? 'pencil' : tool})}
                            style={{width: 44, height: 44, borderRadius: 4, cursor: 'pointer',
                                border: colour === i ? '3px solid #0f172a' : '1px solid #94a3b8',
                                background: c || 'repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 50% / 8px 8px'}} />
                    ))}
                </div>
                {converted ? (
                    <div style={{fontSize: 12, color: '#92400e', background: '#fffbeb', padding: '4px 8px', borderRadius: 6}}>
                        {t(locale, 'px.converted', {w: image.width, h: image.height})}</div>
                ) : null}
                <div data-testid="bw-pixel-layers" style={{display: 'flex', flexWrap: 'wrap', gap: 6,
                    alignItems: 'center'}}>
                    <strong style={{fontSize: 12}}>{t(locale, 'px.layers')}</strong>
                    <button type="button" style={btn(false)} onClick={this.addLayer}
                        data-testid="bw-pixel-add-layer">+ {t(locale, 'px.addLayer')}</button>
                    {activeLayer ? <label style={{display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 12, minHeight: 44}}>{t(locale, 'px.opacity')} {Math.round(activeLayer.opacity * 100)}%
                        <input type="range" min="0" max="100" value={Math.round(activeLayer.opacity * 100)}
                            data-testid="bw-pixel-layer-opacity" aria-label={t(locale, 'px.opacity')}
                            onPointerDown={() => { this.opacityGesture = false; }}
                            onPointerUp={() => { this.opacityGesture = false; }}
                            onPointerCancel={() => { this.opacityGesture = false; }}
                            onKeyUp={() => { this.opacityGesture = false; }}
                            onBlur={() => { this.opacityGesture = false; }}
                            onChange={event => this.setLayerOpacity(activeLayerId, Number(event.target.value) / 100)} />
                    </label> : null}
                    {layers.slice().reverse().map(layer => {
                        const index = layers.findIndex(item => item.id === layer.id);
                        return <div key={layer.id} style={{display: 'flex', alignItems: 'center', gap: 2,
                            padding: 2, borderRadius: 6,
                            border: layer.id === activeLayerId ? '2px solid #4c97ff' : '1px solid #cbd5e1'}}>
                            {renamingLayerId === layer.id ?
                                <input type="text" autoFocus value={renameValue} maxLength={80}
                                    data-testid="bw-pixel-rename-input" aria-label={t(locale, 'px.renameLayer')}
                                    style={{width: 110, minHeight: 40, boxSizing: 'border-box'}}
                                    onChange={event => this.setState({renameValue: event.target.value})}
                                    onBlur={() => this.finishLayerRename(layer.id, true)}
                                    onKeyDown={event => {
                                        if (event.key === 'Enter' || event.key === 'Escape') {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            this.finishLayerRename(layer.id, event.key === 'Enter');
                                        }
                                    }} /> :
                                <button type="button" style={btn(layer.id === activeLayerId)}
                                    data-testid={`bw-pixel-layer-${layer.id}`}
                                    onClick={() => this.setState({activeLayerId: layer.id, selection: null})}>
                                    {layer.name}</button>}
                            <button type="button" style={btn(false)} aria-label={t(locale, 'px.renameLayer')}
                                data-testid={`bw-pixel-rename-${layer.id}`}
                                onClick={() => this.startLayerRename(layer)}>✎</button>
                            <button type="button" style={btn(false)} aria-label={t(locale,
                                layer.visible ? 'px.hideLayer' : 'px.showLayer')}
                            data-testid={`bw-pixel-visibility-${layer.id}`}
                            onClick={() => this.changeLayer(layer.id, {visible: !layer.visible})}>
                                {layer.visible ? '◉' : '◌'}</button>
                            <button type="button" style={btn(false)} aria-label={t(locale,
                                layer.locked ? 'px.unlockLayer' : 'px.lockLayer')}
                            onClick={() => this.changeLayer(layer.id, {locked: !layer.locked})}>
                                {layer.locked ? '🔒' : '🔓'}</button>
                            <button type="button" style={btn(false)} aria-label={t(locale, 'px.layerUp')}
                                disabled={index === layers.length - 1} onClick={() => this.moveLayer(layer.id, 1)}>↑</button>
                            <button type="button" style={btn(false)} aria-label={t(locale, 'px.layerDown')}
                                disabled={index === 0} onClick={() => this.moveLayer(layer.id, -1)}>↓</button>
                            <button type="button" style={btn(false)} aria-label={t(locale, 'px.deleteLayer')}
                                disabled={layers.length === 1} onClick={() => this.deleteLayer(layer.id)}>×</button>
                        </div>;
                    })}
                </div>
                <div ref={this.viewport} onWheel={this.onWheel}
                    style={{flex: '1 1 auto', minHeight: 180, overflow: 'auto', background: '#f1f5f9'}}>
                    <canvas ref={this.canvas} data-testid="bw-pixel-canvas"
                        style={{display: 'block', width: image.width * this.cellSize() * zoom,
                            height: image.height * this.cellSize() * zoom, imageRendering: 'pixelated',
                            cursor: tool === 'hand' ? 'grab' : 'crosshair', touchAction: 'none'}}
                        onPointerDown={this.onPointerDown} onPointerMove={this.onPointerMove}
                        onPointerUp={this.onPointerUp} onPointerCancel={this.onPointerUp} />
                </div>
                <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                    <button type="button" style={btn(true)} onClick={this.save} data-testid="bw-pixel-save">{t(locale, 'px.save')}</button>
                    <button type="button" style={btn(false)} onClick={this.exportPng}
                        data-testid="bw-pixel-export-png">{t(locale, 'px.exportPng')}</button>
                    <button type="button" style={btn(false)} onClick={this.revert}>{t(locale, 'px.revert')}</button>
                    {status === 'saved' ? <span style={{fontSize: 12, color: '#15803d'}}>{t(locale, 'px.saved')}</span> : null}
                </div>
            </div>
        );
    }
}

PixelArtEditor.propTypes = {
    costumeIndex: PropTypes.number,
    editorTools: PropTypes.node,
    locale: PropTypes.string,
    vm: PropTypes.shape({editingTarget: PropTypes.object, updateSvg: PropTypes.func})
};

export default PixelArtEditor;
