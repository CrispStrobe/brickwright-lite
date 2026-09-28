import paper from '@scratch/paper';
import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import {getSelectedLeafItems} from '../helper/selection';
import {
    getBitmapLayers, setActiveBitmapLayer, addBitmapLayer, deleteBitmapLayer,
    setBitmapLayerVisibility, setBitmapLayerOpacity, moveBitmapLayer
} from '../helper/bw/bitmap-layers';
import styles from './bw-bitmap-layers-controls.css';

const messages = defineMessages({
    layers: {id: 'paint.bitmapLayers.layers', defaultMessage: 'Layers', description: 'Bitmap layer panel'},
    close: {id: 'paint.bitmapLayers.close', defaultMessage: 'Close layers', description: 'Close bitmap layer panel'},
    add: {id: 'paint.bitmapLayers.add', defaultMessage: 'Add layer', description: 'Add a bitmap layer'},
    remove: {id: 'paint.bitmapLayers.remove', defaultMessage: 'Delete layer', description: 'Delete a bitmap layer'},
    show: {id: 'paint.bitmapLayers.show', defaultMessage: 'Show layer', description: 'Show a bitmap layer'},
    hide: {id: 'paint.bitmapLayers.hide', defaultMessage: 'Hide layer', description: 'Hide a bitmap layer'},
    up: {id: 'paint.bitmapLayers.up', defaultMessage: 'Move layer up', description: 'Move a bitmap layer up'},
    down: {id: 'paint.bitmapLayers.down', defaultMessage: 'Move layer down', description: 'Move a bitmap layer down'},
    opacity: {id: 'paint.bitmapLayers.opacity', defaultMessage: 'Layer opacity', description: 'Bitmap layer opacity'},
    newLayer: {id: 'paint.bitmapLayers.newLayer', defaultMessage: 'Layer {number}',
        description: 'Default name for a bitmap layer'}
});
const icon = kind => {
    const shapes = {
        add: <path d="M12 4v16M4 12h16" />,
        close: <path d="M5 5 19 19M19 5 5 19" />,
        eye: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" /></>,
        eyeOff: <>
            <path d="M3 3 21 21M9.9 6.2A12 12 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.3" />
            <path d="M6.4 6.8C3.6 8.4 2 12 2 12s4 6 10 6c1.2 0 2.4-.2 3.4-.6" />
        </>,
        up: <path d="m5 14 7-7 7 7M12 7v13" />,
        down: <path d="m5 10 7 7 7-7M12 4v13" />
    };
    return <svg aria-hidden="true" fill="none" height="22" stroke="currentColor"
        strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22">
        {shapes[kind]}
    </svg>;
};
const IconButton = ({label, name, disabled, onClick, children}) => <button
    aria-label={label}
    className={styles.iconButton}
    data-testid={`bw-bitmap-layer-${name}`}
    disabled={disabled}
    title={label}
    type="button"
    onClick={onClick}
>{children}</button>;
IconButton.propTypes = {
    children: PropTypes.node,
    disabled: PropTypes.bool,
    label: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired
};

class BitmapLayersControls extends React.Component {
    constructor (props) {
        super(props);
        this.state = {open: false};
        this.anchor = null;
        this.panel = null;
        this.handleOutside = this.handleOutside.bind(this);
    }
    componentDidMount () {
        document.addEventListener('pointerdown', this.handleOutside, true);
    }
    componentWillUnmount () {
        document.removeEventListener('pointerdown', this.handleOutside, true);
    }
    handleOutside (event) {
        if (this.state.open && !this.anchor?.contains(event.target) && !this.panel?.contains(event.target)) {
            this.setState({open: false});
        }
    }
    refresh (snapshot = true) {
        this.props.onUpdateImage(!snapshot);
        this.forceUpdate();
    }
    render () {
        if (!paper.project) return null;
        const {intl} = this.props;
        const t = key => intl.formatMessage(messages[key]);
        const layers = getBitmapLayers();
        const active = layers.find(layer => layer.active) || layers[0];
        if (!active) return null;
        const selected = getSelectedLeafItems().length > 0;
        const index = layers.findIndex(layer => layer.id === active.id);
        const anchorRect = this.anchor?.getBoundingClientRect();
        const position = {left: Math.max(8, Math.min(window.innerWidth - 288, anchorRect?.left || 8)),
            top: Math.max(8, Math.min(window.innerHeight - 330, (anchorRect?.bottom || 200) + 8))};
        return <>
            <button
                aria-expanded={this.state.open}
                aria-label={t('layers')}
                className={styles.iconButton}
                data-testid="bw-bitmap-layers-toggle"
                ref={element => { this.anchor = element; }}
                title={t('layers')}
                type="button"
                onClick={() => this.setState(state => ({open: !state.open}))}
            >
                <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
                    viewBox="0 0 24 24" width="23" height="23">
                    <path d="m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4" />
                </svg>
            </button>
            {this.state.open ? ReactDOM.createPortal(<div
                aria-label={t('layers')}
                className={styles.panel}
                data-testid="bw-bitmap-layers-panel"
                ref={element => { this.panel = element; }}
                role="dialog"
                style={position}
            >
                <div className={styles.header}>
                    <strong>{t('layers')}</strong>
                    <span>{layers.length}</span>
                    <IconButton label={t('add')} name="add" disabled={selected} onClick={() => {
                        addBitmapLayer(intl.formatMessage(messages.newLayer, {number: layers.length + 1}));
                        this.refresh();
                    }}>{icon('add')}</IconButton>
                    <IconButton label={t('close')} name="close" onClick={() => this.setState({open: false})}>
                        {icon('close')}</IconButton>
                </div>
                <div className={styles.list}>
                    {[...layers].reverse().map(layer => <div className={styles.layerRow} key={layer.id}>
                        <button
                            aria-pressed={layer.active}
                            className={layer.active ? styles.activeLayer : styles.layerName}
                            data-testid={`bw-bitmap-layer-item-${layer.id}`}
                            title={layer.name}
                            type="button"
                            onClick={() => { setActiveBitmapLayer(layer.id); this.refresh(false); }}
                        >{layer.name}</button>
                        <IconButton label={t(layer.visible ? 'hide' : 'show')}
                            name={`visibility-${layer.id}`} disabled={layers.length < 2}
                            onClick={() => {
                                setBitmapLayerVisibility(layer.id, !layer.visible);
                                this.refresh();
                            }}>{icon(layer.visible ? 'eye' : 'eyeOff')}</IconButton>
                    </div>)}
                </div>
                <label className={styles.opacity}>
                    <span>{t('opacity')} {Math.round(active.opacity * 100)}%</span>
                    <input aria-label={t('opacity')} data-testid="bw-bitmap-layer-opacity" type="range"
                        min="0" max="100" disabled={layers.length < 2}
                        value={Math.round(active.opacity * 100)} onChange={event => {
                            setBitmapLayerOpacity(active.id, Number(event.target.value) / 100);
                            this.refresh();
                        }} />
                </label>
                <div className={styles.actions}>
                    <IconButton label={t('up')} name="up" disabled={index === layers.length - 1}
                        onClick={() => { moveBitmapLayer(active.id, 1); this.refresh(); }}>{icon('up')}</IconButton>
                    <IconButton label={t('down')} name="down" disabled={index === 0}
                        onClick={() => { moveBitmapLayer(active.id, -1); this.refresh(); }}>{icon('down')}</IconButton>
                    <IconButton label={t('remove')} name="delete" disabled={layers.length < 2 || selected}
                        onClick={() => { deleteBitmapLayer(active.id); this.refresh(); }}>{icon('close')}</IconButton>
                </div>
            </div>, document.body) : null}
        </>;
    }
}
BitmapLayersControls.propTypes = {
    intl: intlShape.isRequired,
    onUpdateImage: PropTypes.func.isRequired,
    viewBounds: PropTypes.instanceOf(paper.Matrix)
};

export default connect(state => ({viewBounds: state.scratchPaint.viewBounds}))(injectIntl(BitmapLayersControls));
