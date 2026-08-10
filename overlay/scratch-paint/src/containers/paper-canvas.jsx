import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import paper from '@scratch/paper';
import Formats from '../lib/format';
import log from '../log/log';

import {performSnapshot} from '../helper/undo';
import {undoSnapshot, clearUndoState} from '../reducers/undo';
import {isGroup, ungroupItems} from '../helper/group';
import {clearRaster, convertBackgroundGuideLayer, getRaster, setupLayers} from '../helper/layer';
import {clearSelectedItems} from '../reducers/selected-items';
import {
    ART_BOARD_WIDTH, ART_BOARD_HEIGHT, CENTER, MAX_WORKSPACE_BOUNDS,
    clampViewBounds, resetZoom, setWorkspaceBounds, zoomToFit, resizeCrosshair
} from '../helper/view';
import {ensureClockwise, scaleWithStrokes} from '../helper/math';
import {clearHoveredItem} from '../reducers/hover';
import {clearPasteOffset} from '../reducers/clipboard';
import {changeFormat} from '../reducers/format';
import {updateViewBounds} from '../reducers/view-bounds';
import {saveZoomLevel, setZoomLevelId} from '../reducers/zoom-levels';

import styles from './paper-canvas.css';

class PaperCanvas extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'clearQueuedImport',
            'setCanvas',
            'importSvg',
            'initializeSvg',
            'maybeZoomToFit',
            'switchCostume',
            'onViewResize',
            'recalibrateSize'
        ]);
    }
    componentDidMount () {
        paper.setup(this.canvas);
        paper.view.on('resize', this.onViewResize);
        // Brickwright: paper only learns the canvas changed size from a WINDOW resize (the canvas
        // is rendered with resize="true" and nothing else notifies it). Anything that resizes the
        // canvas WITHIN an unchanged window — opening the properties rail, switching between the
        // small and large stage, dragging a pane divider — therefore left paper drawing and
        // hit-testing against a stale viewport: artwork spilling outside its box, and every mouse
        // coordinate offset, which reads as broken zooming and panning. See the note on
        // recalibrateSize below, which describes exactly this failure and until now had no
        // trigger for it. Observing the element covers every cause at once instead of asking each
        // possible cause to remember to announce itself.
        resetZoom();
        if (this.props.zoomLevelId) {
            this.props.setZoomLevelId(this.props.zoomLevelId);
            if (this.props.zoomLevels[this.props.zoomLevelId]) {
                // This is the matrix that the view should be zoomed to after image import
                this.shouldZoomToFit = this.props.zoomLevels[this.props.zoomLevelId];
            } else {
                // Zoom to fit true means find a comfortable zoom level for viewing the costume
                this.shouldZoomToFit = true;
            }
        } else {
            this.props.updateViewBounds(paper.view.matrix);
        }

        const context = this.canvas.getContext('2d');
        context.webkitImageSmoothingEnabled = false;
        context.imageSmoothingEnabled = false;

        // Don't show handles by default
        paper.settings.handleSize = 0;
        // Make layers.
        setupLayers(this.props.format);
        this.importImage(
            this.props.imageFormat, this.props.image, this.props.rotationCenterX, this.props.rotationCenterY);
        // Last, so it can never interfere with the initial zoom-to-fit above.
        this.observeCanvasResize();
    }
    /**
     * Brickwright: re-measure when the canvas ELEMENT changes size, whatever moved it — the
     * properties rail opening, the small/large stage buttons, a pane divider, browser zoom.
     * paper itself only learns of a WINDOW resize (the canvas is rendered with resize="true"),
     * so every other cause left it drawing and hit-testing against a stale viewport.
     *
     * The guards matter as much as the observer. ResizeObserver always delivers one callback for
     * the INITIAL measurement, which is not a resize at all; reacting to it ran clampViewBounds
     * while the costume was still being imported and zoomed to fit, and left the view parked off
     * the artwork with the workspace background showing. A callback reporting a size we already
     * hold is likewise not a resize, and neither is one that arrives while a zoom-to-fit is still
     * pending.
     */
    observeCanvasResize () {
        if (typeof ResizeObserver === 'undefined') return;
        let lastSize = null;
        this.resizeObserver = new ResizeObserver(entries => {
            if (!paper.view || !entries.length) return;
            const {width, height} = entries[0].contentRect;
            const size = `${Math.round(width)}x${Math.round(height)}`;
            if (lastSize === null) { // the initial measurement, not a change
                lastSize = size;
                return;
            }
            if (size === lastSize) return;
            lastSize = size;
            // An import is still settling the view; it will size itself when it lands.
            if (this.shouldZoomToFit) return;
            this.onViewResize();
        });
        this.resizeObserver.observe(this.canvas);
    }
    componentWillReceiveProps (newProps) {
        if (this.props.imageId !== newProps.imageId) {
            this.switchCostume(newProps.imageFormat, newProps.image,
                newProps.rotationCenterX, newProps.rotationCenterY,
                this.props.zoomLevelId, newProps.zoomLevelId);
        }
        if (this.props.format !== newProps.format) {
            this.recalibrateSize();
            convertBackgroundGuideLayer(newProps.format);
        }
    }
    componentWillUnmount () {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        this.clearQueuedImport();
        // shouldZoomToFit means the zoom level hasn't been initialized yet
        if (!this.shouldZoomToFit) {
            this.props.saveZoomLevel();
        }
        paper.remove();
    }
    clearQueuedImport () {
        if (this.queuedImport) {
            window.clearTimeout(this.queuedImport);
            this.queuedImport = null;
        }
        if (this.queuedImageToLoad) {
            this.queuedImageToLoad.src = '';
            this.queuedImageToLoad.onload = null;
            this.queuedImageToLoad = null;
        }
    }
    switchCostume (format, image, rotationCenterX, rotationCenterY, oldZoomLevelId, newZoomLevelId) {
        if (oldZoomLevelId && oldZoomLevelId !== newZoomLevelId) {
            this.props.saveZoomLevel();
        }
        if (newZoomLevelId && oldZoomLevelId !== newZoomLevelId) {
            if (this.props.zoomLevels[newZoomLevelId]) {
                this.shouldZoomToFit = this.props.zoomLevels[newZoomLevelId];
            } else {
                this.shouldZoomToFit = true;
            }
            this.props.setZoomLevelId(newZoomLevelId);
        }
        for (const layer of paper.project.layers) {
            if (layer.data.isRasterLayer) {
                clearRaster();
            } else if (!layer.data.isBackgroundGuideLayer &&
                !layer.data.isDragCrosshairLayer &&
                !layer.data.isOutlineLayer) {
                layer.removeChildren();
            }
        }
        this.props.clearUndo();
        this.props.clearSelectedItems();
        this.props.clearHoveredItem();
        this.props.clearPasteOffset();
        this.importImage(format, image, rotationCenterX, rotationCenterY);
    }
    importImage (format, image, rotationCenterX, rotationCenterY) {
        // Stop any in-progress imports
        this.clearQueuedImport();

        if (!image) {
            this.props.changeFormat(Formats.VECTOR_SKIP_CONVERT);
            performSnapshot(this.props.undoSnapshot, Formats.VECTOR_SKIP_CONVERT);
            this.recalibrateSize();
            return;
        }

        if (format === 'jpg' || format === 'png') {
            // import bitmap
            this.props.changeFormat(Formats.BITMAP_SKIP_CONVERT);

            const mask = new paper.Shape.Rectangle(getRaster().getBounds());
            mask.guide = true;
            mask.locked = true;
            mask.setPosition(CENTER);
            mask.clipMask = true;

            const imgElement = new Image();
            this.queuedImageToLoad = imgElement;
            imgElement.onload = () => {
                if (!this.queuedImageToLoad) return;
                this.queuedImageToLoad = null;

                if (typeof rotationCenterX === 'undefined') {
                    rotationCenterX = imgElement.width / 2;
                }
                if (typeof rotationCenterY === 'undefined') {
                    rotationCenterY = imgElement.height / 2;
                }

                getRaster().drawImage(
                    imgElement,
                    (ART_BOARD_WIDTH / 2) - rotationCenterX,
                    (ART_BOARD_HEIGHT / 2) - rotationCenterY);
                getRaster().drawImage(
                    imgElement,
                    (ART_BOARD_WIDTH / 2) - rotationCenterX,
                    (ART_BOARD_HEIGHT / 2) - rotationCenterY);

                this.maybeZoomToFit(true /* isBitmap */);
                performSnapshot(this.props.undoSnapshot, Formats.BITMAP_SKIP_CONVERT);
                this.recalibrateSize();
            };
            imgElement.src = image;
        } else if (format === 'svg') {
            this.props.changeFormat(Formats.VECTOR_SKIP_CONVERT);
            this.importSvg(image, rotationCenterX, rotationCenterY);
        } else {
            log.error(`Didn't recognize format: ${format}. Use 'jpg', 'png' or 'svg'.`);
            this.props.changeFormat(Formats.VECTOR_SKIP_CONVERT);
            performSnapshot(this.props.undoSnapshot, Formats.VECTOR_SKIP_CONVERT);
            this.recalibrateSize();
        }
    }
    maybeZoomToFit (isBitmapMode) {
        if (this.shouldZoomToFit instanceof paper.Matrix) {
            paper.view.matrix = this.shouldZoomToFit;
            this.props.updateViewBounds(paper.view.matrix);
            resizeCrosshair();
        } else if (this.shouldZoomToFit === true) {
            zoomToFit(isBitmapMode);
        }
        this.shouldZoomToFit = false;
        setWorkspaceBounds();
        this.props.updateViewBounds(paper.view.matrix);
    }
    importSvg (svg, rotationCenterX, rotationCenterY) {
        const paperCanvas = this;
        // Pre-process SVG to prevent parsing errors (discussion from #213)
        // 1. Remove svg: namespace on elements.
        // TODO: remove
        svg = svg.split(/<\s*svg:/).join('<');
        svg = svg.split(/<\/\s*svg:/).join('</');
        // 2. Add root svg namespace if it does not exist.
        const svgAttrs = svg.match(/<svg [^>]*>/);
        if (svgAttrs && svgAttrs[0].indexOf('xmlns=') === -1) {
            svg = svg.replace(
                '<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
        }

        // Get the origin which the viewBox is defined relative to. During import, Paper will translate
        // the viewBox to start at (0, 0), and we need to translate it back for some costumes to render
        // correctly.
        const parser = new DOMParser();
        const svgDom = parser.parseFromString(svg, 'text/xml');
        const viewBox = svgDom.documentElement.attributes.viewBox ?
            svgDom.documentElement.attributes.viewBox.value.match(/\S+/g) : null;
        if (viewBox) {
            for (let i = 0; i < viewBox.length; i++) {
                viewBox[i] = parseFloat(viewBox[i]);
            }
        }

        // Brickwright: give every rounded <rect> both of its corner radii before paper sees it.
        //
        // SVG says a missing ry defaults to rx and vice versa, so `<rect rx="12">` is a rect with
        // 12x12 corners. paper's importer does not implement that default: it reads ry straight
        // off the node, gets nothing, and builds the shape with radius (12, 0) — and a corner
        // radius with a zero axis is a SQUARE corner. Every `<rect rx="...">` written the normal
        // way therefore lost its rounding on import, and the next edit exported the squared-off
        // result back over the costume, so the damage was permanent. Our own robot sprite is 14
        // such rects (the 6 that also carry ry always survived, which is why some corners looked
        // right and others did not).
        //
        // Normalising the input is the honest fix: it is what the spec already says the markup
        // means, it is confined to the file we own, and it leaves paper untouched.
        const rects = svgDom.getElementsByTagName('rect');
        let normalizedRadii = false;
        for (let i = 0; i < rects.length; i++) {
            const rx = rects[i].getAttribute('rx');
            const ry = rects[i].getAttribute('ry');
            // Copy the value verbatim rather than parsing it: percentages and SVG2's `auto` are
            // both legal here and both mean "whatever the other axis is".
            if (rx !== null && ry === null) {
                rects[i].setAttribute('ry', rx);
                normalizedRadii = true;
            } else if (ry !== null && rx === null) {
                rects[i].setAttribute('rx', ry);
                normalizedRadii = true;
            }
        }
        // Only re-serialise when something actually changed, so costumes without this problem go
        // to paper as the exact bytes they arrived as.
        if (normalizedRadii) {
            svg = new XMLSerializer().serializeToString(svgDom);
        }

        paper.project.importSVG(svg, {
            expandShapes: true,
            onLoad: function (item) {
                if (!item) {
                    log.error('SVG import failed:');
                    log.info(svg);
                    this.props.changeFormat(Formats.VECTOR_SKIP_CONVERT);
                    performSnapshot(paperCanvas.props.undoSnapshot, Formats.VECTOR_SKIP_CONVERT);
                    return;
                }
                item.remove();

                // Without the callback, rasters' load function has not been called yet, and they are
                // positioned incorrectly
                paperCanvas.queuedImport = paperCanvas.recalibrateSize(() => {
                    paperCanvas.props.updateViewBounds(paper.view.matrix);
                    paperCanvas.initializeSvg(item, rotationCenterX, rotationCenterY, viewBox);
                });
            }
        });
    }
    initializeSvg (item, rotationCenterX, rotationCenterY, viewBox) {
        if (this.queuedImport) this.queuedImport = null;
        const itemWidth = item.bounds.width;
        const itemHeight = item.bounds.height;

        // Get reference to viewbox
        let mask;
        if (item.clipped) {
            for (const child of item.children) {
                if (child.isClipMask()) {
                    mask = child;
                    break;
                }
            }
            mask.clipMask = false;
        } else {
            mask = new paper.Shape.Rectangle(item.bounds);
        }
        mask.guide = true;
        mask.locked = true;
        mask.matrix = new paper.Matrix(); // Identity
        // Set the artwork to get clipped at the max costume size
        mask.size.height = MAX_WORKSPACE_BOUNDS.height;
        mask.size.width = MAX_WORKSPACE_BOUNDS.width;
        mask.setPosition(CENTER);
        paper.project.activeLayer.addChild(mask);
        mask.clipMask = true;

        // Reduce single item nested in groups
        if (item instanceof paper.Group && item.children.length === 1) {
            item = item.reduce();
        }

        ensureClockwise(item);
        scaleWithStrokes(item, 2, new paper.Point()); // Import at 2x

        // Apply rotation center
        if (typeof rotationCenterX !== 'undefined' && typeof rotationCenterY !== 'undefined') {
            let rotationPoint = new paper.Point(rotationCenterX, rotationCenterY);
            if (viewBox && viewBox.length >= 2 && !isNaN(viewBox[0]) && !isNaN(viewBox[1])) {
                rotationPoint = rotationPoint.subtract(viewBox[0], viewBox[1]);
            }
            item.translate(CENTER.subtract(rotationPoint.multiply(2)));
        } else {
            // Center
            item.translate(CENTER.subtract(itemWidth, itemHeight));
        }

        paper.project.activeLayer.insertChild(0, item);
        if (isGroup(item)) {
            // Fixes an issue where we may export empty groups
            for (const child of item.children) {
                if (isGroup(child) && child.children.length === 0) {
                    child.remove();
                }
            }
            ungroupItems([item]);
        }

        performSnapshot(this.props.undoSnapshot, Formats.VECTOR_SKIP_CONVERT);
        this.maybeZoomToFit();
    }
    onViewResize () {
        setWorkspaceBounds(true /* clipEmpty */);
        clampViewBounds();
        // Fix incorrect paper canvas scale on browser zoom reset
        this.recalibrateSize();
        this.props.updateViewBounds(paper.view.matrix);
    }
    recalibrateSize (callback) {
        // Sets the size that Paper thinks the canvas is to the size the canvas element actually is.
        // When these are out of sync, the mouse events in the paint editor don't line up correctly.
        return window.setTimeout(() => {
            // If the component unmounts, the canvas will be removed from the page, detaching paper.view.
            // This could also be called before paper.view exists.
            // In either case, return early if so without running the callback.
            if (!paper.view) return;
            // Prevent blurriness caused if the "CSS size" of the element is a float--
            // setting canvas dimensions to floats floors them, but we need to round instead
            const elemSize = paper.DomElement.getSize(paper.view.element);
            elemSize.width = Math.round(elemSize.width);
            elemSize.height = Math.round(elemSize.height);
            paper.view.setViewSize(elemSize);

            if (callback) callback();
        }, 0);
    }
    setCanvas (canvas) {
        this.canvas = canvas;
        if (this.props.canvasRef) {
            this.props.canvasRef(canvas);
        }
    }
    render () {
        return (
            <canvas
                className={styles.paperCanvas}
                ref={this.setCanvas}
                style={{cursor: this.props.cursor}}
                resize="true"
            />
        );
    }
}

PaperCanvas.propTypes = {
    canvasRef: PropTypes.func,
    changeFormat: PropTypes.func.isRequired,
    clearHoveredItem: PropTypes.func.isRequired,
    clearPasteOffset: PropTypes.func.isRequired,
    clearSelectedItems: PropTypes.func.isRequired,
    clearUndo: PropTypes.func.isRequired,
    cursor: PropTypes.string,
    format: PropTypes.oneOf(Object.keys(Formats)),
    image: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.instanceOf(HTMLImageElement)
    ]),
    imageFormat: PropTypes.string, // The incoming image's data format, used during import. The user could switch this.
    imageId: PropTypes.string,
    rotationCenterX: PropTypes.number,
    rotationCenterY: PropTypes.number,
    saveZoomLevel: PropTypes.func.isRequired,
    setZoomLevelId: PropTypes.func.isRequired,
    undoSnapshot: PropTypes.func.isRequired,
    updateViewBounds: PropTypes.func.isRequired,
    zoomLevelId: PropTypes.string,
    zoomLevels: PropTypes.shape({
        currentZoomLevelId: PropTypes.string
    })
};
const mapStateToProps = state => ({
    mode: state.scratchPaint.mode,
    cursor: state.scratchPaint.cursor,
    format: state.scratchPaint.format,
    zoomLevels: state.scratchPaint.zoomLevels
});
const mapDispatchToProps = dispatch => ({
    undoSnapshot: snapshot => {
        dispatch(undoSnapshot(snapshot));
    },
    clearUndo: () => {
        dispatch(clearUndoState());
    },
    clearSelectedItems: () => {
        dispatch(clearSelectedItems());
    },
    clearHoveredItem: () => {
        dispatch(clearHoveredItem());
    },
    clearPasteOffset: () => {
        dispatch(clearPasteOffset());
    },
    changeFormat: format => {
        dispatch(changeFormat(format));
    },
    saveZoomLevel: () => {
        dispatch(saveZoomLevel(paper.view.matrix));
    },
    setZoomLevelId: zoomLevelId => {
        dispatch(setZoomLevelId(zoomLevelId));
    },
    updateViewBounds: matrix => {
        dispatch(updateViewBounds(matrix));
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(PaperCanvas);
