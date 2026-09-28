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
    copySelectedPixels, moveSelectedPixels, outlinePixels, pasteSelectedPixels, replaceColourPixels,
    resizeLayers, selectionRect, sourceFrames, sourceLayers,
    stampBrushInto, transformPixels} from '../../lib/bw-pixel-layers.js';
import {
    ARCADE_PALETTE, svgToPixels, quantizeRgba, floodFill, toImgLiteral, parsePaletteFile, sliceSpriteSheet
} from '../../lib/bw-makecode/pixel-image.js';
import {parseExactImgLiteral} from '../../lib/bw-makecode/arcade-assets.js';

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
        'px.rotateCW': 'Rotate clockwise', 'px.rotateCCW': 'Rotate counterclockwise',
        'px.showLiteral': 'Show Arcade img', 'px.importLiteral': 'Import Arcade img',
        'px.applyLiteral': 'Add as layer', 'px.closeLiteral': 'Close',
        'px.invalidLiteral': 'Paste one complete Arcade img literal with equal-length rows and valid colours.',
        'px.largeLiteral': 'Arcade image exceeds the 128×128 pixel-editor limit.',
        'px.translucentLiteral': 'Arcade img cannot represent partly transparent layers. Set their opacity to 0% or 100% first.',
        'px.literalHint': 'The imported image becomes a new editable layer. Existing layers are kept.',
        'px.copyLiteral': 'Copy', 'px.literalLabel': 'Arcade img literal',
        'px.paletteColour': 'Edit palette colour',
        'px.resetPalette': 'Reset palette', 'px.paletteHint': 'Change the colour of every pixel with this index.',
        'px.importPalette': 'Import palette',
        'px.invalidPalette': 'Use a 15- or 16-colour .hex, .txt or GIMP .gpl palette.',
        'px.filledRect': 'Filled rectangle', 'px.filledCircle': 'Filled circle',
        'px.brushSize': 'Brush size', 'px.replaceColour': 'Replace colour',
        'px.replaceFrom': 'Replace index', 'px.outline': 'Outline',
        'px.copySelection': 'Copy selection', 'px.cutSelection': 'Cut selection',
        'px.pasteSelection': 'Paste selection', 'px.pastedLayer': 'Pasted pixels',
        'px.frames': 'Frames', 'px.addFrame': 'Add frame', 'px.duplicateFrame': 'Duplicate frame',
        'px.deleteFrame': 'Delete frame', 'px.frameDuration': 'Frame duration (ms)',
        'px.play': 'Play', 'px.pause': 'Pause', 'px.onionSkin': 'Onion skin',
        'px.frameUp': 'Earlier frame', 'px.frameDown': 'Later frame',
        'px.exportSheet': 'Export sprite sheet PNG', 'px.importSheet': 'Import sprite sheet PNG',
        'px.sheetFrameWidth': 'Frame width (PNG px)', 'px.sheetFrameHeight': 'Frame height (PNG px)',
        'px.sheetScale': 'PNG pixels per art pixel', 'px.sheetPreview': 'Preview slices',
        'px.sheetReplace': 'Replace frames with slices', 'px.sheetClose': 'Close sheet import',
        'px.sheetInvalid': 'Use a PNG with 2–64 complete frames, each at most 128×128 art pixels.',
        'px.sheetHint': 'Rows are read left to right. Colours match the current palette; replacing frames is undoable.',
        'px.frameNumber': 'Frame {number}'
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
        'px.rotateCW': 'Im Uhrzeigersinn drehen', 'px.rotateCCW': 'Gegen den Uhrzeigersinn drehen',
        'px.showLiteral': 'Arcade-img anzeigen', 'px.importLiteral': 'Arcade-img importieren',
        'px.applyLiteral': 'Als Ebene hinzufügen', 'px.closeLiteral': 'Schließen',
        'px.invalidLiteral': 'Ein vollständiges Arcade-img mit gleich langen Zeilen und gültigen Farben einfügen.',
        'px.largeLiteral': 'Das Arcade-Bild überschreitet die Grenze von 128×128 Pixeln.',
        'px.translucentLiteral': 'Arcade-img unterstützt keine teilweise transparenten Ebenen. Deckkraft zuerst auf 0 % oder 100 % setzen.',
        'px.literalHint': 'Das importierte Bild wird eine neue bearbeitbare Ebene. Bestehende Ebenen bleiben erhalten.',
        'px.copyLiteral': 'Kopieren', 'px.literalLabel': 'Arcade-img-Literal',
        'px.paletteColour': 'Palettenfarbe bearbeiten',
        'px.resetPalette': 'Palette zurücksetzen', 'px.paletteHint': 'Die Farbe aller Pixel mit diesem Index ändern.',
        'px.importPalette': 'Palette importieren',
        'px.invalidPalette': 'Eine .hex-, .txt- oder GIMP-.gpl-Palette mit 15 oder 16 Farben verwenden.',
        'px.filledRect': 'Gefülltes Rechteck', 'px.filledCircle': 'Gefüllter Kreis',
        'px.brushSize': 'Pinselgröße', 'px.replaceColour': 'Farbe ersetzen',
        'px.replaceFrom': 'Index ersetzen', 'px.outline': 'Umriss',
        'px.copySelection': 'Auswahl kopieren', 'px.cutSelection': 'Auswahl ausschneiden',
        'px.pasteSelection': 'Auswahl einfügen', 'px.pastedLayer': 'Eingefügte Pixel',
        'px.frames': 'Einzelbilder', 'px.addFrame': 'Einzelbild hinzufügen',
        'px.duplicateFrame': 'Einzelbild duplizieren', 'px.deleteFrame': 'Einzelbild löschen',
        'px.frameDuration': 'Bilddauer (ms)', 'px.play': 'Abspielen', 'px.pause': 'Pause',
        'px.onionSkin': 'Zwiebelschicht', 'px.frameUp': 'Bild nach vorn', 'px.frameDown': 'Bild nach hinten',
        'px.exportSheet': 'Sprite-Sheet-PNG exportieren', 'px.importSheet': 'Sprite-Sheet-PNG importieren',
        'px.sheetFrameWidth': 'Bildbreite (PNG-Pixel)', 'px.sheetFrameHeight': 'Bildhöhe (PNG-Pixel)',
        'px.sheetScale': 'PNG-Pixel pro Grafikpixel', 'px.sheetPreview': 'Schnitte vorschauen',
        'px.sheetReplace': 'Bilder durch Schnitte ersetzen', 'px.sheetClose': 'Import schließen',
        'px.sheetInvalid': 'Ein PNG mit 2–64 vollständigen Bildern bis 128×128 Grafikpixel verwenden.',
        'px.sheetHint': 'Zeilen werden von links gelesen. Farben nutzen die aktuelle Palette; Ersetzen kann rückgängig gemacht werden.',
        'px.frameNumber': 'Bild {number}'
    }
};
const t = makeT(L10N);

const thumbnailData = (layers, width, height, palette) => {
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const ctx = source.getContext('2d');
    for (const layer of layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        ctx.globalAlpha = layer.opacity;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const colour = palette[layer.pixels[(y * width) + x]];
                if (!colour) continue;
                ctx.fillStyle = colour;
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }
    const preview = document.createElement('canvas');
    preview.width = 40;
    preview.height = 40;
    const previewCtx = preview.getContext('2d');
    previewCtx.imageSmoothingEnabled = false;
    const ratio = Math.min(40 / width, 40 / height);
    previewCtx.drawImage(source, (40 - width * ratio) / 2, (40 - height * ratio) / 2,
        width * ratio, height * ratio);
    return preview.toDataURL('image/png');
};

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
            palette: [...ARCADE_PALETTE],
            scale: 4, zoom: 1, colour: 2, replaceFrom: 0, brushSize: 1, tool: 'pencil',
            mirror: false, converted: false, selection: null,
            frames: [], activeFrameId: null, framesOpen: false, onionSkin: false, playing: false,
            sheetMode: false, sheetName: '', sheetWidth: 0, sheetHeight: 0,
            sheetFrameWidth: 16, sheetFrameHeight: 16, sheetPixelScale: 1,
            sheetPreview: [], sheetError: '',
            status: '', w: 16, h: 16, renamingLayerId: null, renameValue: '',
            literalMode: null, literalText: '', literalError: '', paletteError: ''};
        this.canvas = React.createRef();
        this.viewport = React.createRef();
        this.root = React.createRef();
        this.paletteFile = React.createRef();
        this.sheetFile = React.createRef();
        this.sheetRgba = null;
        this.thumbnailCache = new WeakMap();
        this.drawing = false;
        this.strokeRecorded = false;
        this.pointers = new Map();
        this.undoStack = [];
        this.redoStack = [];
        this.opacityGesture = false;
        this.paletteGesture = false;
        this.pixelClipboard = null;
        this.playTimer = null;
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

    componentWillUnmount () { clearTimeout(this.playTimer); }

    componentDidUpdate (prev, prevState) {
        if (prev.costumeIndex !== this.props.costumeIndex || this.loadedCostume !== this.costume()) this.load();
        else if (prevState.image !== this.state.image || prevState.selection !== this.state.selection ||
            prevState.palette !== this.state.palette || prevState.onionSkin !== this.state.onionSkin) this.paint();
        if (prevState.palette !== this.state.palette && this.sheetRgba && this.state.sheetMode) this.previewSheet();
    }

    costume () {
        const target = this.props.vm && this.props.vm.editingTarget;
        return target && target.sprite && target.sprite.costumes[this.props.costumeIndex];
    }

    async load (size) {
        clearTimeout(this.playTimer);
        this.sheetRgba = null;
        const costume = this.costume();
        this.loadedCostume = costume;
        if (!costume) { this.setState({image: null}); return; }
        let image = null;
        let layers = null;
        let scale = 4;
        const document = getCostumeDocument(costume);
        const palette = document?.palette || [...ARCADE_PALETTE];
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
            const px = svgToPixels(costume.asset.decodeText(), palette);
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
            image = quantizeRgba(rgba, w, h, tw, th, palette);
            converted = true;
        }
        if (!layers) layers = [{...blankLayer('pixels', 'Pixels', image.width, image.height),
            pixels: image.pixels}];
        const savedFrames = !size && sourceFrames(document, image.width, image.height);
        const frames = savedFrames || [{id: 'frame-1', durationMs: 100, layers,
            activeLayerId: layers[layers.length - 1].id}];
        const activeFrameId = savedFrames ? document.animation.activeFrameId : frames[0].id;
        const activeLayerId = layers.some(layer => layer.id === document?.activeLayerId) ?
            document.activeLayerId : layers[layers.length - 1].id;
        this.undoStack = [];
        this.redoStack = [];
        this.pixelClipboard = null;
        this.setState({image, layers, activeLayerId, frames, activeFrameId, playing: false,
            sheetMode: false, sheetPreview: [], sheetError: '',
            selection: null, renamingLayerId: null, renameValue: '',
            literalMode: null, literalText: '', literalError: '', paletteError: '',
            original: {layers, activeLayerId, frames, activeFrameId,
                selection: null, palette, w: image.width, h: image.height},
            palette,
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
        const {frames, activeFrameId, onionSkin} = this.state;
        if (onionSkin && frames.length > 1) {
            const index = frames.findIndex(frame => frame.id === activeFrameId);
            this.paintLayers(ctx, c, frames[(index - 1 + frames.length) % frames.length].layers, 0.22);
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

    paintLayers (ctx, c, shownLayers = this.state.layers, alpha = 1) {
        const {image, palette} = this.state;
        for (const layer of shownLayers) {
            if (!layer.visible || layer.opacity <= 0) continue;
            ctx.globalAlpha = layer.opacity * alpha;
            for (let y = 0; y < image.height; y++) {
                for (let x = 0; x < image.width; x++) {
                    const colour = palette[layer.pixels[(y * image.width) + x]];
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
        if (this.state.playing) this.stopPlayback();
        this.undoStack.push({layers: this.state.layers, activeLayerId: this.state.activeLayerId,
            frames: this.state.frames, activeFrameId: this.state.activeFrameId,
            selection: this.state.selection, palette: this.state.palette,
            w: this.state.w, h: this.state.h});
        if (this.undoStack.length > 80) this.undoStack.shift();
        this.redoStack = [];
    }

    undo () {
        if (!this.undoStack.length) return;
        this.redoStack.push({layers: this.state.layers, activeLayerId: this.state.activeLayerId,
            frames: this.state.frames, activeFrameId: this.state.activeFrameId,
            selection: this.state.selection, palette: this.state.palette,
            w: this.state.w, h: this.state.h});
        this.restore(this.undoStack.pop());
    }

    redo () {
        if (!this.redoStack.length) return;
        this.undoStack.push({layers: this.state.layers, activeLayerId: this.state.activeLayerId,
            frames: this.state.frames, activeFrameId: this.state.activeFrameId,
            selection: this.state.selection, palette: this.state.palette,
            w: this.state.w, h: this.state.h});
        this.restore(this.redoStack.pop());
    }

    restore (snapshot) {
        this.stopPlayback();
        this.setState({...snapshot, image: composeLayers(snapshot.layers, snapshot.w, snapshot.h), status: ''});
    }

    materializeFrames (state = this.state) {
        return state.frames.map(frame => frame.id === state.activeFrameId ?
            {...frame, layers: state.layers, activeLayerId: state.activeLayerId} : frame);
    }

    selectFrame (id) {
        this.setState(state => {
            if (id === state.activeFrameId) return null;
            const frames = this.materializeFrames(state);
            const frame = frames.find(item => item.id === id);
            if (!frame) return null;
            return {frames, activeFrameId: id, layers: frame.layers,
                activeLayerId: frame.activeLayerId, image: composeLayers(frame.layers, state.w, state.h),
                selection: null, status: ''};
        });
    }

    addFrame (duplicate = false) {
        if (this.state.frames.length >= 64) return;
        this.stopPlayback();
        this.remember();
        const id = `frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        this.setState(state => {
            const frames = this.materializeFrames(state);
            const current = frames.find(frame => frame.id === state.activeFrameId);
            const layers = current.layers.map(layer => ({...layer,
                pixels: duplicate ? new Uint8Array(layer.pixels) : new Uint8Array(state.w * state.h)}));
            const frame = {id, durationMs: current.durationMs, layers, activeLayerId: current.activeLayerId};
            frames.splice(frames.indexOf(current) + 1, 0, frame);
            return {frames, activeFrameId: id, layers, activeLayerId: frame.activeLayerId,
                image: composeLayers(layers, state.w, state.h), selection: null, framesOpen: true, status: ''};
        });
    }

    deleteFrame () {
        if (this.state.frames.length < 2) return;
        this.stopPlayback();
        this.remember();
        this.setState(state => {
            const frames = this.materializeFrames(state);
            const index = frames.findIndex(frame => frame.id === state.activeFrameId);
            frames.splice(index, 1);
            const frame = frames[Math.min(index, frames.length - 1)];
            return {frames, activeFrameId: frame.id, layers: frame.layers,
                activeLayerId: frame.activeLayerId, image: composeLayers(frame.layers, state.w, state.h),
                selection: null, status: ''};
        });
    }

    moveFrame (direction) {
        const index = this.state.frames.findIndex(frame => frame.id === this.state.activeFrameId);
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= this.state.frames.length) return;
        this.remember();
        this.setState(state => {
            const frames = this.materializeFrames(state);
            [frames[index], frames[nextIndex]] = [frames[nextIndex], frames[index]];
            return {frames, status: ''};
        });
    }

    setFrameDuration (value) {
        const durationMs = Math.max(20, Math.min(10000, Math.round(Number(value) || 100)));
        const frame = this.state.frames.find(item => item.id === this.state.activeFrameId);
        if (!frame || frame.durationMs === durationMs) return;
        this.remember();
        this.setState(state => ({frames: this.materializeFrames(state).map(item =>
            item.id === state.activeFrameId ? {...item, durationMs} : item), status: ''}));
    }

    stopPlayback () {
        clearTimeout(this.playTimer);
        this.playTimer = null;
        if (this.state.playing) this.setState({playing: false});
    }

    playNextFrame () {
        if (!this.state.playing || this.state.frames.length < 2) return;
        const index = this.state.frames.findIndex(frame => frame.id === this.state.activeFrameId);
        const next = this.state.frames[(index + 1) % this.state.frames.length];
        this.selectFrame(next.id);
        this.playTimer = setTimeout(() => this.playNextFrame(), next.durationMs);
    }

    togglePlayback () {
        if (this.state.playing) { this.stopPlayback(); return; }
        if (this.state.frames.length < 2) return;
        this.setState({playing: true}, () => {
            const frame = this.state.frames.find(item => item.id === this.state.activeFrameId);
            this.playTimer = setTimeout(() => this.playNextFrame(), frame.durationMs);
        });
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

    copySelection () {
        const {selection, w} = this.state;
        const active = this.activeLayer();
        if (!selection || !active || !active.visible) return false;
        this.pixelClipboard = {...copySelectedPixels(active.pixels, w, selection),
            x: selection.x, y: selection.y};
        this.forceUpdate();
        return true;
    }

    cutSelection () {
        const active = this.activeLayer();
        if (!active || active.locked || !active.visible) return;
        if (!this.copySelection()) return;
        this.clearSelection();
    }

    pasteSelection () {
        const clipboard = this.pixelClipboard;
        if (!clipboard) return;
        const {w, h} = this.state;
        const pasted = pasteSelectedPixels(clipboard, w, h, clipboard.x, clipboard.y);
        if (!pasted) return;
        this.remember();
        const id = `pixels-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const layer = {...blankLayer(id, t(this.props.locale || browserLocale(), 'px.pastedLayer'), w, h),
            pixels: pasted.pixels};
        this.setState(state => {
            const index = state.layers.findIndex(item => item.id === state.activeLayerId);
            const layers = state.layers.slice();
            layers.splice(index + 1, 0, layer);
            return {layers, activeLayerId: id, selection: pasted.selection, tool: 'move',
                image: composeLayers(layers, w, h), status: ''};
        });
    }

    nudgeSelection (dx, dy) {
        const {selection, w, h} = this.state;
        const active = this.activeLayer();
        if (!selection || !active || !active.visible || active.locked) return;
        const moved = moveSelectedPixels(active.pixels, w, h, selection, dx, dy);
        if (moved.selection.x === selection.x && moved.selection.y === selection.y) return;
        this.remember();
        this.setState(state => {
            const layers = state.layers.map(layer => layer.id === state.activeLayerId ?
                {...layer, pixels: moved.pixels} : layer);
            return {layers, selection: moved.selection, image: composeLayers(layers, w, h), status: ''};
        });
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
        const {image, tool, colour, mirror, brushSize} = this.state;
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
            const plot = (px, py) => stampBrushInto(pixels, state.w, state.h,
                px, py, value, brushSize, mirror);
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
        const filled = ['filledRect', 'filledCircle'].includes(this.state.tool);
        const plot = (x, y) => stampBrushInto(pixels, width, height, x, y, value,
            filled ? 1 : this.state.brushSize, this.state.mirror);
        const [x1, y1] = end;
        const [startX, startY] = this.shapeStart;
        if (this.state.tool === 'rect' || this.state.tool === 'filledRect') {
            const left = Math.min(startX, x1);
            const right = Math.max(startX, x1);
            const top = Math.min(startY, y1);
            const bottom = Math.max(startY, y1);
            if (filled) {
                for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) plot(x, y);
            } else {
                for (let x = left; x <= right; x++) { plot(x, top); plot(x, bottom); }
                for (let y = top; y <= bottom; y++) { plot(left, y); plot(right, y); }
            }
        } else if (this.state.tool === 'circle' || this.state.tool === 'filledCircle') {
            const cx = (startX + x1) / 2;
            const cy = (startY + y1) / 2;
            const rx = Math.abs(x1 - startX) / 2;
            const ry = Math.abs(y1 - startY) / 2;
            if (filled) {
                for (let y = Math.min(startY, y1); y <= Math.max(startY, y1); y++) {
                    for (let x = Math.min(startX, x1); x <= Math.max(startX, x1); x++) {
                        const dx = (x - cx) / Math.max(1, rx);
                        const dy = (y - cy) / Math.max(1, ry);
                        if ((dx * dx) + (dy * dy) <= 1.0001) plot(x, y);
                    }
                }
            } else {
                // Dense sampling gives an unbroken one-pixel outline even for
                // small and narrow circles, including a one-cell drag.
                const steps = Math.max(1, 16 * Math.max(Math.abs(x1 - startX), Math.abs(y1 - startY)));
                for (let step = 0; step < steps; step++) {
                    const angle = (step * 2 * Math.PI) / steps;
                    plot(Math.round(cx + rx * Math.cos(angle)), Math.round(cy + ry * Math.sin(angle)));
                }
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
        } else if (['line', 'rect', 'circle', 'filledRect', 'filledCircle'].includes(this.state.tool)) {
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
        else if (this.drawing && ['line', 'rect', 'circle', 'filledRect', 'filledCircle']
            .includes(this.state.tool)) this.applyShape(event);
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
        if (this.state.selection && !event.metaKey && !event.ctrlKey && !event.altKey &&
            ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            const moves = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
            this.nudgeSelection(...moves[event.key]);
            return;
        }
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
            } else if (event.shiftKey && (/^Digit[1-9]$/.test(event.code) || /^[a-f]$/i.test(event.key))) {
                event.preventDefault();
                this.outline(/^Digit[1-9]$/.test(event.code) ? Number(event.code.slice(-1)) :
                    parseInt(event.key, 16));
            } else if (event.shiftKey && (event.code === 'Period' || event.code === 'Comma')) {
                event.preventDefault();
                this.setState(state => ({brushSize: Math.max(1, Math.min(8,
                    state.brushSize + (event.code === 'Period' ? 1 : -1)))}));
            } else if (/^[0-9]$/.test(event.key)) {
                event.preventDefault();
                this.setState({colour: Number(event.key)});
            } else if (event.key.toLowerCase() === 'r') {
                event.preventDefault();
                this.replaceColour();
            } else {
                const tools = {b: 'pencil', p: 'pencil', e: 'erase', g: 'fill', l: 'line',
                    u: 'rect', c: 'circle', m: 'select', q: 'hand'};
                const tool = tools[event.key.toLowerCase()];
                if (tool) {
                    event.preventDefault();
                    this.setState({tool});
                }
            }
            return;
        }
        if (!(event.metaKey || event.ctrlKey)) return;
        const key = event.key.toLowerCase();
        if (this.state.selection && ['c', 'x'].includes(key)) {
            event.preventDefault();
            event.stopPropagation();
            if (key === 'x') this.cutSelection();
            else this.copySelection();
            return;
        }
        if (key === 'v' && this.pixelClipboard) {
            event.preventDefault();
            event.stopPropagation();
            this.pasteSelection();
            return;
        }
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
            const frames = this.materializeFrames(state).map(frame => ({...frame,
                layers: resizeLayers(frame.layers, state.w, state.h, W, H)}));
            const layers = frames.find(frame => frame.id === state.activeFrameId).layers;
            return {frames, layers, image: composeLayers(layers, W, H), w: W, h: H,
                selection: null, status: ''};
        });
    }

    transform (operation) {
        const {layers, activeLayerId, selection, w, h} = this.state;
        const active = layers.find(layer => layer.id === activeLayerId);
        if (!active || active.locked || !active.visible) return;
        const turn = operation === 'rotate-cw' || operation === 'rotate-ccw';
        if (turn && !selection && this.materializeFrames().some(frame =>
            frame.layers.some(layer => layer.locked))) return;
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
        const frames = turn && !selection ? this.materializeFrames().map(frame => ({...frame,
            layers: frame.id === this.state.activeFrameId ? next : frame.layers.map(layer => ({...layer,
                pixels: transformPixels(layer.pixels, w, h, null, operation).pixels}))})) : this.state.frames;
        this.setState({layers: next, frames,
            image: composeLayers(next, transformed.width, transformed.height),
            w: transformed.width, h: transformed.height, selection: transformed.selection, status: ''});
    }

    replaceColour () {
        const {replaceFrom, colour, selection, w, h} = this.state;
        const active = this.activeLayer();
        if (!active || active.locked || !active.visible || replaceFrom === colour) return;
        this.remember();
        this.updateActive(replaceColourPixels(active.pixels, w, h, selection, replaceFrom, colour));
    }

    outline (colour = this.state.colour) {
        const {selection, w, h} = this.state;
        const active = this.activeLayer();
        if (!active || active.locked || !active.visible || !colour) return;
        this.remember();
        this.updateActive(outlinePixels(active.pixels, w, h, selection, colour));
    }

    showLiteral () {
        const {layers, w, h} = this.state;
        const locale = this.props.locale || browserLocale();
        if (layers.some(layer => layer.visible && layer.opacity > 0 && layer.opacity < 1)) {
            this.setState({literalMode: 'export', literalText: '',
                literalError: t(locale, 'px.translucentLiteral')});
            return;
        }
        this.setState({literalMode: 'export', literalText: toImgLiteral(composeLayers(layers, w, h)),
            literalError: ''});
    }

    importLiteral () {
        const locale = this.props.locale || browserLocale();
        const parsed = parseExactImgLiteral(this.state.literalText);
        if (!parsed) {
            this.setState({literalError: t(locale, 'px.invalidLiteral')});
            return;
        }
        if (parsed.width > 128 || parsed.height > 128) {
            this.setState({literalError: t(locale, 'px.largeLiteral')});
            return;
        }
        this.remember();
        const id = `pixels-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        this.setState(state => {
            const w = Math.max(state.w, parsed.width);
            const h = Math.max(state.h, parsed.height);
            const pixels = new Uint8Array(w * h);
            for (let y = 0; y < parsed.height; y++) {
                pixels.set(parsed.pixels.subarray(y * parsed.width, (y + 1) * parsed.width), y * w);
            }
            const layers = [...resizeLayers(state.layers, state.w, state.h, w, h),
                {...blankLayer(id, 'Arcade img', w, h), pixels}];
            const frames = this.materializeFrames(state).map(frame => frame.id === state.activeFrameId ?
                {...frame, layers, activeLayerId: id} :
                {...frame, layers: resizeLayers(frame.layers, state.w, state.h, w, h)});
            return {frames, layers, activeLayerId: id, image: composeLayers(layers, w, h), w, h,
                selection: null, status: '', literalMode: null, literalText: '', literalError: ''};
        });
    }

    async copyLiteral () {
        try {
            if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
            await navigator.clipboard.writeText(this.state.literalText);
        } catch (error) {
            this.root.current?.querySelector('[data-testid="bw-pixel-img-literal"]')?.select();
        }
    }

    setPaletteColour (index, colour) {
        if (index < 1 || index > 15 || !/^#[0-9a-f]{6}$/i.test(colour)) return;
        if (!this.paletteGesture) {
            this.remember();
            this.paletteGesture = true;
        }
        this.setState(state => {
            const palette = state.palette.slice();
            palette[index] = colour.toLowerCase();
            return {palette, status: '', paletteError: ''};
        });
    }

    resetPalette () {
        if (this.state.palette.every((value, index) => value === ARCADE_PALETTE[index])) return;
        this.remember();
        this.paletteGesture = false;
        this.setState({palette: [...ARCADE_PALETTE], status: '', paletteError: ''});
    }

    async importPalette (event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        let palette = null;
        try { palette = parsePaletteFile(await file.text()); } catch (error) { /* report below */ }
        if (!palette) {
            this.setState({paletteError: t(this.props.locale || browserLocale(), 'px.invalidPalette')});
            return;
        }
        this.remember();
        this.paletteGesture = false;
        this.setState({palette, status: '', paletteError: ''});
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
        this.stopPlayback();
        const {image, scale, layers, activeLayerId, activeFrameId, palette} = this.state;
        const vm = this.props.vm;
        if (!image || !vm) return;
        const frames = this.materializeFrames();
        const svg = layersToSvg(layers, image.width, image.height, scale, palette);
        vm.updateSvg(this.props.costumeIndex, svg, (image.width * scale) / 2, (image.height * scale) / 2);
        setCostumeDocument(this.costume(), layersDocument(layers, image.width, image.height, scale, activeLayerId,
            palette, frames.length > 1 ? {frames, activeFrameId} : null));
        this.setState({frames, original: {layers, activeLayerId, frames, activeFrameId,
            selection: null, palette,
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

    exportSheet () {
        const {image, scale} = this.state;
        const frames = this.materializeFrames();
        if (!image || frames.length < 2) return;
        const canvas = document.createElement('canvas');
        canvas.width = image.width * scale * frames.length;
        canvas.height = image.height * scale;
        const ctx = canvas.getContext('2d');
        frames.forEach((frame, index) => {
            ctx.save();
            ctx.translate(index * image.width * scale, 0);
            this.paintLayers(ctx, scale, frame.layers);
            ctx.restore();
        });
        const name = (this.costume()?.name || 'costume').replace(/[\\/:*?"<>|]/g, '_');
        canvas.toBlob(blob => {
            if (blob) downloadBlob(`${name}-spritesheet.png`, blob);
        }, 'image/png');
    }

    frameThumbnail (layers, width, height, palette) {
        const cached = this.thumbnailCache.get(layers);
        if (cached?.palette === palette) return cached.url;
        const url = thumbnailData(layers, width, height, palette);
        this.thumbnailCache.set(layers, {palette, url});
        return url;
    }

    async loadSheet (event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const locale = this.props.locale || browserLocale();
        if (!/\.png$/i.test(file.name) || file.size > 16 * 1024 * 1024) {
            this.setState({sheetMode: true, sheetPreview: [], sheetError: t(locale, 'px.sheetInvalid')});
            return;
        }
        let url = null;
        try {
            const header = new DataView(await file.slice(0, 24).arrayBuffer());
            const signature = [137, 80, 78, 71, 13, 10, 26, 10];
            if (header.byteLength < 24 || !signature.every((byte, index) => header.getUint8(index) === byte) ||
                !header.getUint32(16) || !header.getUint32(20) ||
                header.getUint32(16) > 16384 || header.getUint32(20) > 16384 ||
                header.getUint32(16) * header.getUint32(20) > 16 * 1024 * 1024) {
                throw new Error('invalid PNG dimensions');
            }
            url = URL.createObjectURL(file);
            const image = new Image();
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = url;
            });
            const width = image.naturalWidth;
            const height = image.naturalHeight;
            if (!width || !height || width > 16384 || height > 16384 || width * height > 16 * 1024 * 1024) {
                throw new Error('large PNG');
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            this.sheetRgba = ctx.getImageData(0, 0, width, height).data;
            const expectedWidth = this.state.w * this.state.scale;
            const expectedHeight = this.state.h * this.state.scale;
            const count = (width / expectedWidth) * (height / expectedHeight);
            const matching = width % expectedWidth === 0 && height % expectedHeight === 0 &&
                count >= 2 && count <= 64;
            this.setState({sheetMode: true, sheetName: file.name, sheetWidth: width, sheetHeight: height,
                sheetFrameWidth: matching ? expectedWidth : Math.min(16, width),
                sheetFrameHeight: matching ? expectedHeight : Math.min(16, height),
                sheetPixelScale: matching ? this.state.scale : 1,
                sheetPreview: [], sheetError: ''}, () => this.previewSheet());
        } catch (error) {
            this.sheetRgba = null;
            this.setState({sheetMode: true, sheetPreview: [], sheetError: t(locale, 'px.sheetInvalid')});
        } finally {
            if (url) URL.revokeObjectURL(url);
        }
    }

    previewSheet () {
        const {sheetWidth, sheetHeight, sheetFrameWidth, sheetFrameHeight, sheetPixelScale, palette} = this.state;
        const sliced = this.sheetRgba && sliceSpriteSheet(this.sheetRgba, sheetWidth, sheetHeight,
            sheetFrameWidth, sheetFrameHeight, sheetPixelScale, palette);
        if (!sliced) {
            this.setState({sheetPreview: [], sheetError: t(this.props.locale || browserLocale(), 'px.sheetInvalid')});
            return;
        }
        const sheetPreview = sliced.frames.map(image => ({image,
            url: thumbnailData([{visible: true, opacity: 1, pixels: image.pixels}],
                image.width, image.height, palette)}));
        this.setState({sheetPreview, sheetError: ''});
    }

    importSheet () {
        const {sheetPreview} = this.state;
        if (sheetPreview.length < 2) return;
        this.stopPlayback();
        this.remember();
        const {width, height} = sheetPreview[0].image;
        const frames = sheetPreview.map(({image}, index) => {
            const layer = {...blankLayer('pixels', 'Pixels', width, height), pixels: image.pixels};
            return {id: `sheet-${Date.now()}-${index}`, durationMs: 100,
                activeLayerId: 'pixels', layers: [layer]};
        });
        this.sheetRgba = null;
        this.setState({frames, activeFrameId: frames[0].id, layers: frames[0].layers,
            activeLayerId: 'pixels', image: composeLayers(frames[0].layers, width, height),
            w: width, h: height, selection: null, converted: false,
            sheetMode: false, sheetPreview: [], sheetError: '', framesOpen: true, status: ''});
    }

    revert () {
        const {original} = this.state;
        if (original) this.restore(original);
    }

    render () {
        const locale = this.props.locale || browserLocale();
        const {image, layers, activeLayerId, selection, colour, replaceFrom, brushSize, tool, mirror, converted,
            frames, activeFrameId, framesOpen, onionSkin, playing, status, w, h, zoom, palette,
            sheetMode, sheetName, sheetWidth, sheetHeight, sheetFrameWidth, sheetFrameHeight,
            sheetPixelScale, sheetPreview, sheetError,
            renamingLayerId, renameValue, literalMode, literalText, literalError, paletteError} =
            this.state;
        if (!image) return <div style={{padding: 24, color: '#64748b'}}>{t(locale, 'px.none')}</div>;
        const activeLayer = layers.find(layer => layer.id === activeLayerId);
        const activeFrame = frames.find(frame => frame.id === activeFrameId);
        const frameIndex = frames.findIndex(frame => frame.id === activeFrameId);
        const btn = active => ({padding: '8px 10px', minHeight: 44, borderRadius: 6, fontSize: 12,
            whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
            border: `1px solid ${active ? '#4c97ff' : '#cbd5e1'}`, background: active ? '#e0edff' : '#fff'});
        return (
            <div ref={this.root} data-testid="bw-pixel-editor" tabIndex={0}
                onKeyDown={this.handleKeyDown}
                style={{display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
                    height: '100%', boxSizing: 'border-box', overflow: 'auto'}}>
                <div style={{display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center',
                    minHeight: 52, overflowX: 'auto', overflowY: 'hidden', overscrollBehaviorX: 'contain'}}>
                    {this.props.editorTools}
                    <button type="button" style={btn(framesOpen)} data-testid="bw-pixel-frames-toggle"
                        aria-expanded={framesOpen} onClick={() => this.setState({framesOpen: !framesOpen})}>
                        {t(locale, 'px.frames')} {frames.length}</button>
                    {['pencil', 'line', 'rect', 'filledRect', 'circle', 'filledCircle', 'select', 'move',
                        'fill', 'erase', 'pick', 'hand'].map(k => (
                        <button key={k} type="button" style={btn(tool === k)} data-testid={`bw-pixel-tool-${k}`}
                            onClick={() => this.setState({tool: k})}>{t(locale, `px.${k}`)}</button>
                    ))}
                    <button type="button" style={btn(mirror)} aria-pressed={mirror}
                        onClick={() => this.setState({mirror: !mirror})}>{t(locale, 'px.mirror')}</button>
                    <label style={{display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12}}>
                        {t(locale, 'px.brushSize')} {brushSize}
                        <input type="range" min="1" max="8" value={brushSize} data-testid="bw-pixel-brush-size"
                            aria-label={t(locale, 'px.brushSize')}
                            onChange={event => this.setState({brushSize: Number(event.target.value)})} />
                    </label>
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
                    {selection ? <button type="button" style={btn(false)} onClick={() => this.copySelection()}
                        data-testid="bw-pixel-copy-selection">{t(locale, 'px.copySelection')}</button> : null}
                    {selection ? <button type="button" style={btn(false)} onClick={() => this.cutSelection()}
                        disabled={!activeLayer || activeLayer.locked || !activeLayer.visible}
                        data-testid="bw-pixel-cut-selection">{t(locale, 'px.cutSelection')}</button> : null}
                    <button type="button" style={btn(false)} onClick={() => this.pasteSelection()}
                        disabled={!this.pixelClipboard} data-testid="bw-pixel-paste-selection">
                        {t(locale, 'px.pasteSelection')}</button>
                    {selection ? <button type="button" style={btn(false)} onClick={() => this.setState({selection: null})}>
                        {t(locale, 'px.deselect')}</button> : null}
                    <label style={{display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12}}>
                        {t(locale, 'px.replaceFrom')}
                        <select value={replaceFrom} data-testid="bw-pixel-replace-from"
                            aria-label={t(locale, 'px.replaceFrom')}
                            onChange={event => this.setState({replaceFrom: Number(event.target.value)})}>
                            {palette.map((swatch, index) => <option key={index} value={index}>{index}</option>)}
                        </select>
                    </label>
                    <button type="button" style={btn(false)} data-testid="bw-pixel-replace-colour"
                        disabled={!activeLayer || activeLayer.locked || !activeLayer.visible || replaceFrom === colour}
                        onClick={() => this.replaceColour()}>{t(locale, 'px.replaceColour')}</button>
                    <button type="button" style={btn(false)} data-testid="bw-pixel-outline"
                        disabled={!activeLayer || activeLayer.locked || !activeLayer.visible || colour === 0}
                        onClick={() => this.outline()}>{t(locale, 'px.outline')}</button>
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
                    <button type="button" style={btn(false)} data-testid="bw-pixel-show-img"
                        onClick={() => this.showLiteral()}>{t(locale, 'px.showLiteral')}</button>
                    <button type="button" style={btn(false)} data-testid="bw-pixel-import-img"
                        onClick={() => this.setState({literalMode: 'import', literalText: '', literalError: ''})}>
                        {t(locale, 'px.importLiteral')}</button>
                </div>
                {literalMode ? <div style={{display: 'flex', flexDirection: 'column', gap: 6,
                    padding: 8, border: '1px solid #cbd5e1', borderRadius: 6}}>
                    {literalMode === 'import' ? <span style={{fontSize: 12}}>{t(locale, 'px.literalHint')}</span> : null}
                    <textarea value={literalText} rows={7} spellCheck={false}
                        data-testid="bw-pixel-img-literal" aria-label={t(locale, 'px.literalLabel')}
                        readOnly={literalMode === 'export'}
                        onChange={event => this.setState({literalText: event.target.value, literalError: ''})}
                        style={{width: '100%', boxSizing: 'border-box', fontFamily: 'monospace'}} />
                    {literalError ? <span role="alert" style={{color: '#b91c1c'}}>{literalError}</span> : null}
                    <div style={{display: 'flex', gap: 6}}>
                        {literalMode === 'import' ? <button type="button" style={btn(true)}
                            data-testid="bw-pixel-apply-img" onClick={() => this.importLiteral()}>
                            {t(locale, 'px.applyLiteral')}</button> :
                            <button type="button" style={btn(false)} disabled={!literalText}
                                onClick={() => this.copyLiteral()}>
                                {t(locale, 'px.copyLiteral')}</button>}
                        <button type="button" style={btn(false)}
                            onClick={() => this.setState({literalMode: null, literalError: ''})}>
                            {t(locale, 'px.closeLiteral')}</button>
                    </div>
                </div> : null}
                <div style={{display: 'flex', gap: 8, flexWrap: 'nowrap', alignItems: 'center',
                    minHeight: 52, overflowX: 'auto', overflowY: 'hidden', overscrollBehaviorX: 'contain'}}>
                    <div style={{display: 'flex', gap: 4, flexWrap: 'nowrap', flexShrink: 0}} role="radiogroup">
                        {palette.map((c, i) => (
                            <button key={i} type="button" role="radio" aria-checked={colour === i}
                                title={c || t(locale, 'px.transparent')} data-testid={`bw-pixel-colour-${i}`}
                                onClick={() => this.setState({colour: i, tool: tool === 'pick' ? 'pencil' : tool})}
                                style={{width: 44, height: 44, borderRadius: 4, cursor: 'pointer',
                                    border: colour === i ? '3px solid #0f172a' : '1px solid #94a3b8',
                                    background: c || 'repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 50% / 8px 8px'}} />
                        ))}
                    </div>
                    <label style={{display: 'inline-flex', gap: 6, alignItems: 'center', minHeight: 44,
                        fontSize: 12}} title={t(locale, 'px.paletteHint')}>
                        {t(locale, 'px.paletteColour')} {colour}
                        <input type="color" value={palette[colour] || '#000000'} disabled={colour === 0}
                            data-testid="bw-pixel-palette-edit" aria-label={t(locale, 'px.paletteColour')}
                            onPointerDown={() => { this.paletteGesture = false; }}
                            onPointerUp={() => { this.paletteGesture = false; }}
                            onBlur={() => { this.paletteGesture = false; }}
                            onChange={event => this.setPaletteColour(colour, event.target.value)} />
                    </label>
                    <button type="button" style={btn(false)} data-testid="bw-pixel-palette-reset"
                        onClick={() => this.resetPalette()}>{t(locale, 'px.resetPalette')}</button>
                    <button type="button" style={btn(false)} data-testid="bw-pixel-palette-import"
                        onClick={() => this.paletteFile.current?.click()}>{t(locale, 'px.importPalette')}</button>
                    <input ref={this.paletteFile} type="file" accept=".hex,.txt,.gpl" style={{display: 'none'}}
                        data-testid="bw-pixel-palette-file" onChange={event => this.importPalette(event)} />
                    {paletteError ? <span role="alert" style={{color: '#b91c1c', fontSize: 12}}>{paletteError}</span> : null}
                </div>
                {converted ? (
                    <div style={{fontSize: 12, color: '#92400e', background: '#fffbeb', padding: '4px 8px', borderRadius: 6}}>
                        {t(locale, 'px.converted', {w: image.width, h: image.height})}</div>
                ) : null}
                <div data-testid="bw-pixel-layers" style={{display: 'flex', flexWrap: 'nowrap', gap: 6,
                    alignItems: 'center', minHeight: 52, overflowX: 'auto', overflowY: 'hidden',
                    overscrollBehaviorX: 'contain'}}>
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
                        return <div key={layer.id} style={{display: 'flex', flexShrink: 0, alignItems: 'center', gap: 2,
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
                {framesOpen ? <div data-testid="bw-pixel-frames" style={{display: 'flex', flexShrink: 0,
                    alignItems: 'center', gap: 6, minHeight: 52, overflowX: 'auto', overflowY: 'hidden',
                    overscrollBehaviorX: 'contain'}}>
                    <button type="button" style={btn(false)} data-testid="bw-pixel-import-sheet"
                        onClick={() => this.sheetFile.current?.click()}>{t(locale, 'px.importSheet')}</button>
                    <input ref={this.sheetFile} type="file" accept="image/png,.png" style={{display: 'none'}}
                        data-testid="bw-pixel-sheet-file" onChange={event => this.loadSheet(event)} />
                    {frames.map((frame, index) => <button key={frame.id} type="button"
                        style={btn(frame.id === activeFrameId)} data-testid={`bw-pixel-frame-${index}`}
                        aria-label={t(locale, 'px.frameNumber', {number: index + 1})}
                        aria-pressed={frame.id === activeFrameId}
                        onClick={() => this.selectFrame(frame.id)}>
                        <img src={this.frameThumbnail(frame.id === activeFrameId ? layers : frame.layers,
                            w, h, palette)} alt="" style={{width: 40, height: 40, display: 'block'}} />
                        {index + 1}</button>)}
                    <button type="button" style={btn(false)} data-testid="bw-pixel-add-frame"
                        disabled={frames.length >= 64} onClick={() => this.addFrame()}>{t(locale, 'px.addFrame')}</button>
                    <button type="button" style={btn(false)} data-testid="bw-pixel-duplicate-frame"
                        disabled={frames.length >= 64} onClick={() => this.addFrame(true)}>
                        {t(locale, 'px.duplicateFrame')}</button>
                    <button type="button" style={btn(false)} data-testid="bw-pixel-delete-frame"
                        disabled={frames.length < 2} onClick={() => this.deleteFrame()}>
                        {t(locale, 'px.deleteFrame')}</button>
                    <button type="button" style={btn(false)} aria-label={t(locale, 'px.frameUp')}
                        disabled={frameIndex < 1} onClick={() => this.moveFrame(-1)}>←</button>
                    <button type="button" style={btn(false)} aria-label={t(locale, 'px.frameDown')}
                        disabled={frameIndex >= frames.length - 1} onClick={() => this.moveFrame(1)}>→</button>
                    <label style={{display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
                        whiteSpace: 'nowrap', flexShrink: 0}}>{t(locale, 'px.frameDuration')}
                        <input type="number" min="20" max="10000" step="10" style={{width: 64}}
                            data-testid="bw-pixel-frame-duration" value={activeFrame.durationMs}
                            onChange={event => this.setFrameDuration(event.target.value)} /></label>
                    <button type="button" style={btn(playing)} data-testid="bw-pixel-play-frames"
                        disabled={frames.length < 2} onClick={() => this.togglePlayback()}>
                        {t(locale, playing ? 'px.pause' : 'px.play')}</button>
                    <button type="button" style={btn(false)} data-testid="bw-pixel-export-sheet"
                        disabled={frames.length < 2} onClick={() => this.exportSheet()}>
                        {t(locale, 'px.exportSheet')}</button>
                    <label style={{display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12,
                        whiteSpace: 'nowrap', flexShrink: 0}}>
                        <input type="checkbox" checked={onionSkin} data-testid="bw-pixel-onion-skin"
                            onChange={event => this.setState({onionSkin: event.target.checked})} />
                        {t(locale, 'px.onionSkin')}</label>
                </div> : null}
                {sheetMode ? <div data-testid="bw-pixel-sheet-preview" style={{display: 'flex', flexDirection: 'column',
                    gap: 6, padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, flexShrink: 0}}>
                    <span style={{fontSize: 12}}>{sheetName} ({sheetWidth}×{sheetHeight}) — {t(locale, 'px.sheetHint')}</span>
                    <div style={{display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap'}}>
                        {[[sheetFrameWidth, 'px.sheetFrameWidth', 'width'],
                            [sheetFrameHeight, 'px.sheetFrameHeight', 'height'],
                            [sheetPixelScale, 'px.sheetScale', 'scale']].map(([value, label, key]) =>
                            <label key={key} style={{fontSize: 12}}>{t(locale, label)}
                                <input type="number" min="1" max="16384" value={value}
                                    data-testid={`bw-pixel-sheet-${key}`} style={{width: 70, marginLeft: 4}}
                                    onChange={event => this.setState({
                                        [{width: 'sheetFrameWidth', height: 'sheetFrameHeight',
                                            scale: 'sheetPixelScale'}[key]]: Number(event.target.value),
                                        sheetPreview: [], sheetError: ''})} /></label>)}
                        <button type="button" style={btn(false)} data-testid="bw-pixel-preview-sheet"
                            onClick={() => this.previewSheet()}>{t(locale, 'px.sheetPreview')}</button>
                        <button type="button" style={btn(true)} data-testid="bw-pixel-apply-sheet"
                            disabled={sheetPreview.length < 2} onClick={() => this.importSheet()}>
                            {t(locale, 'px.sheetReplace')}</button>
                        <button type="button" style={btn(false)} onClick={() => {
                            this.sheetRgba = null;
                            this.setState({sheetMode: false, sheetPreview: [], sheetError: ''});
                        }}>{t(locale, 'px.sheetClose')}</button>
                    </div>
                    {sheetError ? <span role="alert" style={{color: '#b91c1c', fontSize: 12}}>{sheetError}</span> : null}
                    {sheetPreview.length ? <div style={{display: 'flex', gap: 5, overflowX: 'auto'}}>
                        {sheetPreview.map((frame, index) => <div key={index} style={{flexShrink: 0,
                            fontSize: 11, textAlign: 'center'}}>
                            <img src={frame.url} alt={t(locale, 'px.frameNumber', {number: index + 1})}
                                style={{width: 40, height: 40, display: 'block'}} />{index + 1}</div>)}
                    </div> : null}
                </div> : null}
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
