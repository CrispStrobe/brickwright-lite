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
import {makeT, browserLocale} from '../../lib/bw-i18n.js';
import {getCostumeDocument, setCostumeDocument} from '../../lib/bw-artwork-bundle.js';
import {
    ARCADE_PALETTE, svgToPixels, pixelsToSvg, quantizeRgba, floodFill, resizeCanvas, blankImage
} from '../../lib/bw-makecode/pixel-image.js';

const L10N = {
    en: {
        'px.pencil': 'Pencil', 'px.fill': 'Fill', 'px.erase': 'Eraser', 'px.pick': 'Pick colour',
        'px.size': 'Size', 'px.save': 'Save', 'px.revert': 'Revert', 'px.saved': 'Saved to the costume.',
        'px.converted': 'This costume was not pixel art: it was converted to {w}×{h} palette pixels. Saving replaces it.',
        'px.reconvert': 'Convert at this size', 'px.none': 'Select a costume to edit.',
        'px.transparent': 'Transparent', 'px.hand': 'Pan', 'px.undo': 'Undo', 'px.redo': 'Redo',
        'px.zoom': 'Zoom'
    },
    de: {
        'px.pencil': 'Stift', 'px.fill': 'Füllen', 'px.erase': 'Radierer', 'px.pick': 'Farbe aufnehmen',
        'px.size': 'Größe', 'px.save': 'Speichern', 'px.revert': 'Verwerfen', 'px.saved': 'Im Kostüm gespeichert.',
        'px.converted': 'Dieses Kostüm war keine Pixelgrafik: Es wurde in {w}×{h} Palettenpixel umgewandelt. Speichern ersetzt es.',
        'px.reconvert': 'In dieser Größe umwandeln', 'px.none': 'Ein Kostüm zum Bearbeiten auswählen.',
        'px.transparent': 'Transparent', 'px.hand': 'Verschieben', 'px.undo': 'Rückgängig',
        'px.redo': 'Wiederholen', 'px.zoom': 'Zoom'
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
        this.state = {image: null, original: null, scale: 4, zoom: 1, colour: 2, tool: 'pencil', converted: false,
            status: '', w: 16, h: 16};
        this.canvas = React.createRef();
        this.viewport = React.createRef();
        this.root = React.createRef();
        this.drawing = false;
        this.strokeRecorded = false;
        this.pointers = new Map();
        this.undoStack = [];
        this.redoStack = [];
        this.lastCell = null;
        this.gesture = null;
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onWheel = this.onWheel.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.undo = this.undo.bind(this);
        this.redo = this.redo.bind(this);
        this.save = this.save.bind(this);
        this.revert = this.revert.bind(this);
    }

    componentDidMount () { this.load(); }

    componentDidUpdate (prev, prevState) {
        if (prev.costumeIndex !== this.props.costumeIndex) this.load();
        else if (prevState.image !== this.state.image) this.paint();
    }

    costume () {
        const target = this.props.vm && this.props.vm.editingTarget;
        return target && target.sprite && target.sprite.costumes[this.props.costumeIndex];
    }

    async load (size) {
        const costume = this.costume();
        if (!costume) { this.setState({image: null}); return; }
        let image = null;
        let scale = 4;
        const document = getCostumeDocument(costume);
        const pixelLayer = !size && document && document.layers.length === 1 &&
            document.layers[0].type === 'pixel' && document.layers[0].content.kind === 'pixels' ?
            document.layers[0] : null;
        if (pixelLayer) {
            const value = pixelLayer.content.value;
            image = {width: value.width, height: value.height, pixels: Uint8Array.from(value.pixels)};
            scale = document.pixelScale || 4;
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
        this.undoStack = [];
        this.redoStack = [];
        this.setState({image, original: image, scale, zoom: 1, converted, status: '',
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
                const i = image.pixels[(y * image.width) + x];
                // Transparent shows as a checkerboard, as in every pixel editor.
                ctx.fillStyle = ARCADE_PALETTE[i] || (((x + y) % 2) ? '#e2e8f0' : '#f8fafc');
                ctx.fillRect(x * c, y * c, c, c);
            }
        }
        ctx.strokeStyle = 'rgba(15,23,42,0.12)';
        for (let x = 0; x <= image.width; x++) { ctx.beginPath(); ctx.moveTo(x * c + 0.5, 0); ctx.lineTo(x * c + 0.5, canvas.height); ctx.stroke(); }
        for (let y = 0; y <= image.height; y++) { ctx.beginPath(); ctx.moveTo(0, y * c + 0.5); ctx.lineTo(canvas.width, y * c + 0.5); ctx.stroke(); }
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
        this.undoStack.push(this.state.image);
        if (this.undoStack.length > 80) this.undoStack.shift();
        this.redoStack = [];
    }

    undo () {
        if (!this.undoStack.length) return;
        this.redoStack.push(this.state.image);
        this.setState({image: this.undoStack.pop(), status: ''});
    }

    redo () {
        if (!this.redoStack.length) return;
        this.undoStack.push(this.state.image);
        this.setState({image: this.redoStack.pop(), status: ''});
    }

    apply (event) {
        const cell = this.cellAt(event);
        if (!cell) return;
        const [x, y] = cell;
        const {image, tool, colour} = this.state;
        const k = (y * image.width) + x;
        if (tool === 'pick') { this.setState({colour: image.pixels[k], tool: 'pencil'}); return; }
        if (tool === 'fill') {
            this.setState(state => ({image: floodFill(state.image, x, y, colour), status: ''}));
            return;
        }
        const value = tool === 'erase' ? 0 : colour;
        const previous = this.lastCell || cell;
        this.setState(state => {
            const current = state.image;
            const pixels = new Uint8Array(current.pixels);
            let x0 = previous[0];
            let y0 = previous[1];
            const dx = Math.abs(x - x0);
            const dy = -Math.abs(y - y0);
            const sx = x0 < x ? 1 : -1;
            const sy = y0 < y ? 1 : -1;
            let error = dx + dy;
            while (true) {
                pixels[(y0 * current.width) + x0] = value;
                if (x0 === x && y0 === y) break;
                const doubled = 2 * error;
                if (doubled >= dy) { error += dy; x0 += sx; }
                if (doubled <= dx) { error += dx; y0 += sy; }
            }
            return {image: {...current, pixels}, status: ''};
        });
        this.lastCell = cell;
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
                this.setState({image: this.undoStack.pop()});
            }
            this.drawing = false;
            this.strokeRecorded = false;
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
        this.strokeRecorded = this.state.tool !== 'pick';
        if (this.strokeRecorded) this.remember();
        this.drawing = true;
        this.lastCell = null;
        this.apply(event);
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
    }

    onPointerUp (event) {
        this.pointers.delete(event.pointerId);
        this.drawing = false;
        this.strokeRecorded = false;
        this.lastCell = null;
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
        this.remember();
        this.setState(state => ({image: resizeCanvas(state.image || blankImage(W, H), W, H), w: W, h: H}));
    }

    save () {
        const {image, scale} = this.state;
        const vm = this.props.vm;
        if (!image || !vm) return;
        const svg = pixelsToSvg(image, {scale});
        vm.updateSvg(this.props.costumeIndex, svg, (image.width * scale) / 2, (image.height * scale) / 2);
        setCostumeDocument(this.costume(), {version: 1, pixelScale: scale, layers: [{
            id: 'pixels', type: 'pixel', name: 'Pixels', visible: true, locked: false,
            opacity: 1, content: {kind: 'pixels', value: {width: image.width, height: image.height,
                pixels: Array.from(image.pixels)}}
        }]});
        this.setState({original: image, converted: false, status: 'saved'});
    }

    revert () { this.setState(state => ({image: state.original, status: ''})); }

    render () {
        const locale = this.props.locale || browserLocale();
        const {image, colour, tool, converted, status, w, h, zoom} = this.state;
        if (!image) return <div style={{padding: 24, color: '#64748b'}}>{t(locale, 'px.none')}</div>;
        const btn = active => ({padding: '8px 10px', minHeight: 40, borderRadius: 6, fontSize: 12, cursor: 'pointer',
            border: `1px solid ${active ? '#4c97ff' : '#cbd5e1'}`, background: active ? '#e0edff' : '#fff'});
        return (
            <div ref={this.root} data-testid="bw-pixel-editor" tabIndex={0}
                onKeyDown={this.handleKeyDown}
                style={{display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
                    height: '100%', boxSizing: 'border-box', overflow: 'auto'}}>
                <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center'}}>
                    {this.props.editorTools}
                    {['pencil', 'fill', 'erase', 'pick', 'hand'].map(k => (
                        <button key={k} type="button" style={btn(tool === k)} data-testid={`bw-pixel-tool-${k}`}
                            onClick={() => this.setState({tool: k})}>{t(locale, `px.${k}`)}</button>
                    ))}
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
                    <span style={{fontSize: 12}}>{t(locale, 'px.zoom')} {Math.round(zoom * 100)}%</span>
                </div>
                <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}} role="radiogroup">
                    {ARCADE_PALETTE.map((c, i) => (
                        <button key={i} type="button" role="radio" aria-checked={colour === i}
                            title={c || t(locale, 'px.transparent')} data-testid={`bw-pixel-colour-${i}`}
                            onClick={() => this.setState({colour: i, tool: tool === 'pick' ? 'pencil' : tool})}
                            style={{width: 36, height: 36, borderRadius: 4, cursor: 'pointer',
                                border: colour === i ? '3px solid #0f172a' : '1px solid #94a3b8',
                                background: c || 'repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 50% / 8px 8px'}} />
                    ))}
                </div>
                {converted ? (
                    <div style={{fontSize: 12, color: '#92400e', background: '#fffbeb', padding: '4px 8px', borderRadius: 6}}>
                        {t(locale, 'px.converted', {w: image.width, h: image.height})}</div>
                ) : null}
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
