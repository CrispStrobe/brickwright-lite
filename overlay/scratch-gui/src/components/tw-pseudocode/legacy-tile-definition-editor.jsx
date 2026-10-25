/** Edit one legacy definition at its existing command site. */
import React from 'react';
import PropTypes from 'prop-types';
import {makeT, browserLocale} from '../../lib/bw-i18n.js';
import {ARCADE_PALETTE} from '../../lib/bw-makecode/arcade-assets.js';
import {findLegacyTileDefinitions, writeLegacyTileDefinition} from '../../lib/bw-makecode/legacy-layout-editor.js';
import {createHistory, commit, undo, redo} from '../../lib/bw-makecode/tilemap-editor.js';
const t = makeT({en: {title: 'Legacy tile definitions', definition: 'Definition', wall: 'Wall for this colour',
    reload: 'Reload definition', dynamicWall: 'The wall condition is computed in its block.', save: 'Save definition', saved: 'Definition saved. Restart to use it.',
    failed: 'Could not save. Reopen the definition after other changes.', undo: 'Undo', redo: 'Redo', colour: 'Colour {n}',
    computedIndex: 'computed colour index', computedImage: 'computed image', mutableFrames: 'runtime frame definitions',
    missingArtwork: 'missing or ambiguous artwork', layeredArtwork: 'edit layered artwork in Pixel', unsupportedArtwork: 'unsupported artwork'},
de: {title: 'Alte Farbkachel-Definitionen', definition: 'Definition', wall: 'Wand für diese Farbe',
    reload: 'Definition neu laden', dynamicWall: 'Die Wandbedingung wird im Block berechnet.', save: 'Definition speichern', saved: 'Definition gespeichert. Zum Anwenden neu starten.',
    failed: 'Speichern nicht möglich. Definition nach anderen Änderungen neu öffnen.', undo: 'Rückgängig', redo: 'Wiederholen', colour: 'Farbe {n}',
    computedIndex: 'berechneter Farbindex', computedImage: 'berechnetes Bild', mutableFrames: 'Bilddefinitionen zur Laufzeit',
    missingArtwork: 'fehlende oder mehrdeutige Grafik', layeredArtwork: 'Ebenengrafik in Pixel bearbeiten', unsupportedArtwork: 'nicht unterstützte Grafik'}});
class LegacyTileDefinitionEditor extends React.Component {
    constructor (props) {
        super(props);
        const refs = findLegacyTileDefinitions(props.vm), selected = refs.findIndex(ref => ref.editable);
        this.state = {refs, selected, history: selected >= 0 ? createHistory(refs[selected].data) : null, colour: 2, status: ''};
        this.canvas = React.createRef();
    }
    componentDidMount () { this.draw(); }
    componentDidUpdate () { this.draw(); }
    draw () {
        const canvas = this.canvas.current, data = this.state.history?.present;
        if (!canvas || !data) return;
        const scale = Math.max(1, Math.min(24, Math.floor(192 / Math.max(data.width, data.height))));
        canvas.width = data.width * scale; canvas.height = data.height * scale;
        const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < data.height; y++) for (let x = 0; x < data.width; x++) {
            ctx.fillStyle = ARCADE_PALETTE[data.pixels[y * data.width + x]] || '#e2e8f0';
            ctx.fillRect(x * scale, y * scale, scale, scale);
        }
    }
    select (index) {
        const refs = findLegacyTileDefinitions(this.props.vm), ref = refs[index];
        if (!ref?.editable) return;
        this.setState({refs, selected: index, history: createHistory(ref.data), status: ''});
    }
    edit (data) { this.setState(state => ({history: commit(state.history, data), status: ''})); }
    save () {
        const {refs, selected, history} = this.state;
        if (!writeLegacyTileDefinition(this.props.vm, refs[selected], history.present)) { this.setState({status: 'failed'}); return; }
        const updated = findLegacyTileDefinitions(this.props.vm);
        this.setState({refs: updated, status: 'saved'});
    }
    render () {
        const {refs, selected, history, colour, status} = this.state;
        if (!refs.length) return null;
        const locale = this.props.locale || browserLocale(), data = history?.present;
        const button = {minHeight: 32, padding: '4px 8px', whiteSpace: 'normal'};
        return <section data-testid="bw-legacy-tile-definitions" style={{padding: 8, border: '1px solid #cbd5e1', flexShrink: 0, maxHeight: '40%', overflow: 'auto'}}>
            <strong>{t(locale, 'title')}</strong>
            <select data-testid="bw-legacy-definition-select" aria-label={t(locale, 'definition')} value={selected}
                onChange={event => this.select(Number(event.target.value))}>
                {refs.map((ref, index) => <option key={ref.blockId} value={index} disabled={!ref.editable}>
                    {ref.targetName} · {t(locale, 'colour', {n: ref.index ?? '?'})} · {index + 1}{ref.reason ? ` — ${t(locale, ref.reason)}` : ''}
                </option>)}
            </select>
            {data ? <>
                <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
                    <canvas ref={this.canvas} data-testid="bw-legacy-definition-canvas" style={{imageRendering: 'pixelated', border: '1px solid #94a3b8'}}
                        onPointerDown={event => {
                            const box = event.currentTarget.getBoundingClientRect();
                            const x = Math.floor((event.clientX - box.left) * data.width / box.width);
                            const y = Math.floor((event.clientY - box.top) * data.height / box.height);
                            if (x < 0 || y < 0 || x >= data.width || y >= data.height) return;
                            if (data.pixels[y * data.width + x] === colour) return;
                            const pixels = data.pixels.slice(); pixels[y * data.width + x] = colour;
                            this.edit({...data, pixels});
                        }} />
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(8, 24px)', gap: 2}}>
                        {ARCADE_PALETTE.map((hex, index) => <button key={index} type="button" data-testid={`bw-legacy-definition-colour-${index}`}
                            title={t(locale, 'colour', {n: index})} aria-pressed={colour === index}
                            style={{width: 24, height: 24, background: hex || '#e2e8f0', border: colour === index ? '2px solid #4c97ff' : '1px solid #94a3b8'}}
                            onClick={() => this.setState({colour: index})} />)}
                    </div>
                    <label><input type="checkbox" data-testid="bw-legacy-definition-wall" disabled={!refs[selected].wallEditable}
                        checked={data.wall === true} onChange={event => this.edit({...data, wall: event.target.checked})} />{t(locale, 'wall')}</label>
                    {!refs[selected].wallEditable ? <span>{t(locale, 'dynamicWall')}</span> : null}
                    <button type="button" style={button} disabled={!history.past.length} onClick={() => this.setState({history: undo(history), status: ''})}>{t(locale, 'undo')}</button>
                    <button type="button" style={button} disabled={!history.future.length} onClick={() => this.setState({history: redo(history), status: ''})}>{t(locale, 'redo')}</button>
                    <button type="button" style={button} data-testid="bw-legacy-definition-reload" onClick={() => this.select(selected)}>{t(locale, 'reload')}</button>
                    <button type="button" style={button} data-testid="bw-legacy-definition-save" onClick={() => this.save()}>{t(locale, 'save')}</button>
                </div>
            </> : <ul>{refs.map(ref => <li key={ref.blockId}>{ref.targetName}: {t(locale, ref.reason)}</li>)}</ul>}
            <div role="status" data-testid="bw-legacy-definition-status">{status ? t(locale, status) : ''}</div>
        </section>;
    }
}
LegacyTileDefinitionEditor.propTypes = {vm: PropTypes.object.isRequired, locale: PropTypes.string};
export default LegacyTileDefinitionEditor;
