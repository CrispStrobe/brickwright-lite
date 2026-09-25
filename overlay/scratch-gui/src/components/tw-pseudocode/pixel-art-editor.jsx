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
import {
    ARCADE_PALETTE, svgToPixels, pixelsToSvg, quantizeRgba, floodFill, resizeCanvas, blankImage
} from '../../lib/bw-makecode/pixel-image.js';

const L10N = {
    en: {
        'px.pencil': 'Pencil', 'px.fill': 'Fill', 'px.erase': 'Eraser', 'px.pick': 'Pick colour',
        'px.size': 'Size', 'px.save': 'Save', 'px.revert': 'Revert', 'px.saved': 'Saved to the costume.',
        'px.converted': 'This costume was not pixel art: it was converted to {w}×{h} palette pixels. Saving replaces it.',
        'px.reconvert': 'Convert at this size', 'px.none': 'Select a costume to edit.',
        'px.transparent': 'Transparent'
    },
    de: {
        'px.pencil': 'Stift', 'px.fill': 'Füllen', 'px.erase': 'Radierer', 'px.pick': 'Farbe aufnehmen',
        'px.size': 'Größe', 'px.save': 'Speichern', 'px.revert': 'Verwerfen', 'px.saved': 'Im Kostüm gespeichert.',
        'px.converted': 'Dieses Kostüm war keine Pixelgrafik: Es wurde in {w}×{h} Palettenpixel umgewandelt. Speichern ersetzt es.',
        'px.reconvert': 'In dieser Größe umwandeln', 'px.none': 'Ein Kostüm zum Bearbeiten auswählen.',
        'px.transparent': 'Transparent'
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
        this.state = {image: null, original: null, scale: 4, colour: 2, tool: 'pencil', converted: false,
            status: '', w: 16, h: 16};
        this.canvas = React.createRef();
        this.drawing = false;
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
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
        if (!size && costume.asset.dataFormat === 'svg') {
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
        this.setState({image, original: image, scale, converted, status: '', w: image.width, h: image.height});
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

    apply (event) {
        const cell = this.cellAt(event);
        if (!cell) return;
        const [x, y] = cell;
        const {image, tool, colour} = this.state;
        const k = (y * image.width) + x;
        if (tool === 'pick') { this.setState({colour: image.pixels[k], tool: 'pencil'}); return; }
        if (tool === 'fill') { this.setState({image: floodFill(image, x, y, colour), status: ''}); return; }
        const value = tool === 'erase' ? 0 : colour;
        if (image.pixels[k] === value) return;
        const pixels = new Uint8Array(image.pixels);
        pixels[k] = value;
        this.setState({image: {...image, pixels}, status: ''});
    }

    onPointerDown (event) { this.drawing = true; this.apply(event); }

    onPointerMove (event) { if (this.drawing && ['pencil', 'erase'].includes(this.state.tool)) this.apply(event); }

    onPointerUp () { this.drawing = false; }

    resize (w, h) {
        const W = Math.max(1, Math.min(128, w | 0));
        const H = Math.max(1, Math.min(128, h | 0));
        this.setState(state => ({image: resizeCanvas(state.image || blankImage(W, H), W, H), w: W, h: H}));
    }

    save () {
        const {image, scale} = this.state;
        const vm = this.props.vm;
        if (!image || !vm) return;
        const svg = pixelsToSvg(image, {scale});
        vm.updateSvg(this.props.costumeIndex, svg, (image.width * scale) / 2, (image.height * scale) / 2);
        this.setState({original: image, converted: false, status: 'saved'});
    }

    revert () { this.setState(state => ({image: state.original, status: ''})); }

    render () {
        const locale = this.props.locale || browserLocale();
        const {image, colour, tool, converted, status, w, h} = this.state;
        if (!image) return <div style={{padding: 24, color: '#64748b'}}>{t(locale, 'px.none')}</div>;
        const btn = active => ({padding: '4px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            border: `1px solid ${active ? '#4c97ff' : '#cbd5e1'}`, background: active ? '#e0edff' : '#fff'});
        return (
            <div data-testid="bw-pixel-editor" style={{display: 'flex', flexDirection: 'column', gap: 8, padding: 12, height: '100%', boxSizing: 'border-box', overflow: 'auto'}}>
                <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center'}}>
                    {['pencil', 'fill', 'erase', 'pick'].map(k => (
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
                </div>
                <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}} role="radiogroup">
                    {ARCADE_PALETTE.map((c, i) => (
                        <button key={i} type="button" role="radio" aria-checked={colour === i}
                            title={c || t(locale, 'px.transparent')} data-testid={`bw-pixel-colour-${i}`}
                            onClick={() => this.setState({colour: i, tool: tool === 'pick' ? 'pencil' : tool})}
                            style={{width: 22, height: 22, borderRadius: 4, cursor: 'pointer',
                                border: colour === i ? '3px solid #0f172a' : '1px solid #94a3b8',
                                background: c || 'repeating-conic-gradient(#e2e8f0 0 25%, #fff 0 50%) 50% / 8px 8px'}} />
                    ))}
                </div>
                {converted ? (
                    <div style={{fontSize: 12, color: '#92400e', background: '#fffbeb', padding: '4px 8px', borderRadius: 6}}>
                        {t(locale, 'px.converted', {w: image.width, h: image.height})}</div>
                ) : null}
                <canvas ref={this.canvas} data-testid="bw-pixel-canvas"
                    style={{imageRendering: 'pixelated', cursor: 'crosshair', maxWidth: '100%', alignSelf: 'flex-start', touchAction: 'none'}}
                    onPointerDown={this.onPointerDown} onPointerMove={this.onPointerMove}
                    onPointerUp={this.onPointerUp} onPointerLeave={this.onPointerUp} />
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
    locale: PropTypes.string,
    vm: PropTypes.shape({editingTarget: PropTypes.object, updateSvg: PropTypes.func})
};

export default PixelArtEditor;
