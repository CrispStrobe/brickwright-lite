import paper from '@scratch/paper';
import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';
import {injectIntl, intlShape} from 'react-intl';
import tx from '../lib/bw-messages';
import {groupSelection, ungroupSelection, shouldShowGroup, shouldShowUngroup} from '../helper/group';
import {bringForward, sendBackward, bringToFront, sendToBack, shouldShowBringForward, shouldShowSendBackward} from '../helper/order';

import CopyPasteHOC from '../hocs/copy-paste-hoc.jsx';
import ModeToolsComponent from '../components/mode-tools/mode-tools.jsx';
import {clearSelectedItems, setSelectedItems} from '../reducers/selected-items';
import {
    deleteSelection,
    getSelectedLeafItems,
    getSelectedSegments,
    getSelectedRootItems,
    getAllRootItems,
    selectAllItems,
    selectAllSegments
} from '../helper/selection';
import {HANDLE_RATIO, ensureClockwise} from '../helper/math';
import {getRaster} from '../helper/layer';
import {flipBitmapHorizontal, flipBitmapVertical, selectAllBitmap} from '../helper/bitmap';
import {rotateBy} from '../helper/bw/transform';
import Formats, {isBitmap, isVector} from '../lib/format';
import Modes from '../lib/modes';

class ModeTools extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'editorMenuActions',
            '_getSelectedUncurvedPoints',
            '_getSelectedUnpointedPoints',
            'hasSelectedUncurvedPoints',
            'hasSelectedUnpointedPoints',
            'handleCurvePoints',
            'handleClosePath',
            'handleFlipHorizontal',
            'handleFlipVertical',
            'handleRotateClockwise',
            'handleRotateCounterClockwise',
            'handleDelete',
            'handleOpenPath',
            'handleSplitPath',
            'handleJoinPaths',
            'handlePasteFromClipboard',
            'handlePointPoints'
        ]);
    }
    componentDidMount () {
        this._menuMounted = true;
        this.publishMenuActions();
    }
    componentDidUpdate (prevProps) {
        if (prevProps.onEditorMenuActions !== this.props.onEditorMenuActions && this.unregisterMenuChannel) this.unregisterMenuChannel();
        if (['format', 'mode', 'selectedItems', 'clipboardItems', 'editorMenuOwner', 'onEditorMenuActions', 'intl']
            .some(key => prevProps[key] !== this.props[key])) this.publishMenuActions();
    }
    componentWillUnmount () {
        this._menuMounted = false;
        if (this.unregisterMenuChannel) this.unregisterMenuChannel();
    }
    publishMenuActions () {
        if (this._menuMounted && typeof this.props.onEditorMenuActions === 'function') {
            this.unregisterMenuChannel = this.props.onEditorMenuActions('selection', this.editorMenuActions, this.props.editorMenuOwner);
        }
    }
    editorMenuActions () {
        if (!this._menuMounted || !paper.project || typeof this.props.onUpdateImage !== 'function') return null;
        const vector = isVector(this.props.format);
        const selecting = this.props.mode === Modes.SELECT || this.props.mode === Modes.BIT_SELECT;
        const reshaping = this.props.mode === Modes.RESHAPE;
        const path = reshaping ? this.getSelectedPath() : null;
        const selected = getSelectedRootItems().length > 0;
        const label = (key, fallback, prefix = 'paint.modeTools') => this.props.intl.formatMessage({id: `${prefix}.${key}`, defaultMessage: fallback});
        const action = (key, fallback, enabled, run, submenu = '', prefix) => ({label: label(key, fallback, prefix),
            location: 'edit', submenu, enabled: !!enabled && typeof run === 'function', run});
        const transform = tx(this.props.intl.locale, 'transform');
        const object = tx(this.props.intl.locale, 'object');
        const selectedItems = () => this.props.setSelectedItems(this.props.format);
        return {
            copy: action('copy', 'Copy', selecting, this.props.onCopyToClipboard),
            paste: action('paste', 'Paste', selecting && this.props.clipboardItems.length > 0, this.handlePasteFromClipboard),
            delete: action('delete', 'Delete', selecting || reshaping, this.handleDelete),
            'select-all': action('selectAll', this.props.intl.locale.startsWith('de') ? 'Alles auswählen' : 'Select all', true, () => {
                // The existing keyboard Select All path, using the same real helpers.
                if (isBitmap(this.props.format)) {
                    selectAllBitmap(this.props.clearSelectedItems);
                    selectedItems();
                } else if (reshaping) {
                    if (selectAllSegments()) selectedItems();
                } else if (selectAllItems()) selectedItems();
            }),
            'flip-horizontal': action('flipHorizontal', 'Flip Horizontal', selecting && (!vector || selected), this.handleFlipHorizontal, transform),
            'flip-vertical': action('flipVertical', 'Flip Vertical', selecting && (!vector || selected), this.handleFlipVertical, transform),
            'rotate-clockwise': action('rotateClockwise', tx(this.props.intl.locale, 'rotateClockwise'), selecting && isBitmap(this.props.format) && selected, this.handleRotateClockwise, transform),
            'rotate-counter-clockwise': action('rotateCounterClockwise', tx(this.props.intl.locale, 'rotateCounterClockwise'), selecting && isBitmap(this.props.format) && selected, this.handleRotateCounterClockwise, transform),
            group: action('group', 'Group', vector && shouldShowGroup(),
                () => groupSelection(this.props.clearSelectedItems, selectedItems, this.props.onUpdateImage), transform, 'paint.paintEditor'),
            ungroup: action('ungroup', 'Ungroup', vector && shouldShowUngroup(),
                () => ungroupSelection(this.props.clearSelectedItems, selectedItems, this.props.onUpdateImage), transform, 'paint.paintEditor'),
            forward: action('forward', 'Forward', vector && shouldShowBringForward(),
                () => bringForward(this.props.onUpdateImage), transform, 'paint.paintEditor'),
            backward: action('backward', 'Backward', vector && shouldShowSendBackward(),
                () => sendBackward(this.props.onUpdateImage), transform, 'paint.paintEditor'),
            front: action('front', 'Front', vector && shouldShowBringForward(),
                () => bringToFront(this.props.onUpdateImage), transform, 'paint.paintEditor'),
            back: action('back', 'Back', vector && shouldShowSendBackward(),
                () => sendToBack(this.props.onUpdateImage), transform, 'paint.paintEditor'),
            'curve-points': action('curved', 'Curved', reshaping && this.hasSelectedUncurvedPoints(), this.handleCurvePoints, object),
            'point-points': action('pointed', 'Pointed', reshaping && this.hasSelectedUnpointedPoints(), this.handlePointPoints, object),
            'close-path': action('closePath', 'Close path', path && !path.closed && path.segments.length >= 3, this.handleClosePath, object),
            'open-path': action('openPath', 'Open path', path && path.closed, this.handleOpenPath, object),
            'split-path': action('splitPath', 'Split at node', reshaping && this.getSplitSegment(), this.handleSplitPath, object),
            'join-paths': action('joinPaths', 'Join paths', reshaping && this.getJoinPaths(), this.handleJoinPaths, object)
        };
    }
    getSelectedPath () {
        const items = getSelectedLeafItems();
        return items.length === 1 && items[0] instanceof paper.Path ? items[0] : null;
    }
    handleClosePath () {
        const path = this.getSelectedPath();
        if (!path || path.closed || path.segments.length < 3) return;
        if (path.firstSegment.point.equals(path.lastSegment.point)) path.join();
        else path.closed = true;
        this.props.setSelectedItems(this.props.format);
        this.props.onUpdateImage();
    }
    handleOpenPath () {
        const path = this.getSelectedPath();
        if (!path || !path.closed) return;
        path.closed = false;
        this.props.setSelectedItems(this.props.format);
        this.props.onUpdateImage();
    }
    getSplitSegment () {
        const path = this.getSelectedPath();
        const selected = getSelectedSegments();
        if (!path || selected.length !== 1 || selected[0].path !== path || path.segments.length < 3) return null;
        const segment = selected[0];
        return path.closed || (segment.index > 0 && segment.index < path.segments.length - 1) ? segment : null;
    }
    handleSplitPath () {
        const segment = this.getSplitSegment();
        if (!segment) return;
        const path = segment.path;
        const wasClosed = path.closed;
        const result = path.splitAt(segment.location);
        if (!result) return;
        paper.project.deselectAll();
        if (wasClosed) {
            path.firstSegment.selected = true;
            path.lastSegment.selected = true;
        } else {
            path.lastSegment.selected = true;
            result.firstSegment.selected = true;
        }
        this.props.setSelectedItems(this.props.format);
        this.props.onUpdateImage();
    }
    getJoinPaths () {
        const paths = getSelectedLeafItems();
        if (paths.length !== 2 || !paths.every(path => path instanceof paper.Path && !path.closed &&
            path.segments.length > 1) || paths[0].parent !== paths[1].parent ||
            !paths[0].matrix.equals(paths[1].matrix) ||
            !paths[0].style.equals(paths[1].style)) return null;
        const ends = path => [path.firstSegment.point, path.lastSegment.point];
        return ends(paths[0]).some(a => ends(paths[1]).some(b => a.isClose(b, 1e-6))) ? paths : null;
    }
    handleJoinPaths () {
        const paths = this.getJoinPaths();
        if (!paths) return;
        paths[0].join(paths[1]);
        paper.project.deselectAll();
        paths[0].selected = true;
        this.props.setSelectedItems(this.props.format);
        this.props.onUpdateImage();
    }
    _getSelectedUncurvedPoints () {
        const items = [];
        const selectedItems = getSelectedLeafItems();
        for (const item of selectedItems) {
            if (!item.segments) continue;
            for (const seg of item.segments) {
                if (seg.selected) {
                    const prev = seg.getPrevious();
                    const next = seg.getNext();
                    const isCurved =
                        (!prev || seg.handleIn.length > 0) &&
                        (!next || seg.handleOut.length > 0) &&
                        (prev && next ? seg.handleOut.isColinear(seg.handleIn) : true);
                    if (!isCurved) items.push(seg);
                }
            }
        }
        return items;
    }
    _getSelectedUnpointedPoints () {
        const points = [];
        const selectedItems = getSelectedLeafItems();
        for (const item of selectedItems) {
            if (!item.segments) continue;
            for (const seg of item.segments) {
                if (seg.selected) {
                    if (seg.handleIn.length > 0 || seg.handleOut.length > 0) {
                        points.push(seg);
                    }
                }
            }
        }
        return points;
    }
    hasSelectedUncurvedPoints () {
        const points = this._getSelectedUncurvedPoints();
        return points.length > 0;
    }
    hasSelectedUnpointedPoints () {
        const points = this._getSelectedUnpointedPoints();
        return points.length > 0;
    }
    handleCurvePoints () {
        let changed;
        const points = this._getSelectedUncurvedPoints();
        for (const point of points) {
            const prev = point.getPrevious();
            const next = point.getNext();
            const noHandles = point.handleIn.length === 0 && point.handleOut.length === 0;
            if (!prev && !next) {
                continue;
            } else if (prev && next && noHandles) {
                // Handles are parallel to the line from prev to next
                point.handleIn = prev.point.subtract(next.point)
                    .normalize()
                    .multiply(prev.getCurve().length * HANDLE_RATIO);
            } else if (prev && !next && point.handleIn.length === 0) {
                // Point is end point
                // Direction is average of normal at the point and direction to prev point, using the
                // normal that points out from the convex side
                // Lenth is curve length * HANDLE_RATIO
                const convexity = prev.getCurve().getCurvatureAtTime(.5) < 0 ? -1 : 1;
                point.handleIn = (prev.getCurve().getNormalAtTime(1)
                    .multiply(convexity)
                    .add(prev.point.subtract(point.point).normalize()))
                    .normalize()
                    .multiply(prev.getCurve().length * HANDLE_RATIO);
            } else if (next && !prev && point.handleOut.length === 0) {
                // Point is start point
                // Direction is average of normal at the point and direction to prev point, using the
                // normal that points out from the convex side
                // Lenth is curve length * HANDLE_RATIO
                const convexity = point.getCurve().getCurvatureAtTime(.5) < 0 ? -1 : 1;
                point.handleOut = (point.getCurve().getNormalAtTime(0)
                    .multiply(convexity)
                    .add(next.point.subtract(point.point).normalize()))
                    .normalize()
                    .multiply(point.getCurve().length * HANDLE_RATIO);
            }

            // Point guaranteed to have a handle now. Make the second handle match the length and direction of first.
            // This defines a curved point.
            if (point.handleIn.length > 0 && next) {
                point.handleOut = point.handleIn.multiply(-1);
            } else if (point.handleOut.length > 0 && prev) {
                point.handleIn = point.handleOut.multiply(-1);
            }
            changed = true;
        }
        if (changed) {
            this.props.setSelectedItems(this.props.format);
            this.props.onUpdateImage();
        }
    }
    handlePointPoints () {
        let changed;
        const points = this._getSelectedUnpointedPoints();
        for (const point of points) {
            const noHandles = point.handleIn.length === 0 && point.handleOut.length === 0;
            if (!noHandles) {
                point.handleIn = null;
                point.handleOut = null;
                changed = true;
            }
        }
        if (changed) {
            this.props.setSelectedItems(this.props.format);
            this.props.onUpdateImage();
        }
    }
    _handleFlip (horizontalScale, verticalScale, selectedItems) {
        if (selectedItems.length === 0) {
            // If nothing is selected, select everything
            selectedItems = getAllRootItems();
        }
        // Record old indices
        for (const item of selectedItems) {
            item.data.index = item.index;
        }

        // Group items so that they flip as a unit
        const itemGroup = new paper.Group(selectedItems);
        // Flip
        itemGroup.scale(horizontalScale, verticalScale);
        ensureClockwise(itemGroup);

        // Remove flipped item from group and insert at old index. Must insert from bottom index up.
        for (let i = 0; i < selectedItems.length; i++) {
            itemGroup.layer.insertChild(selectedItems[i].data.index, selectedItems[i]);
            selectedItems[i].data.index = null;
        }
        itemGroup.remove();

        this.props.onUpdateImage();
    }
    handleFlipHorizontal () {
        const selectedItems = getSelectedRootItems();
        if (isBitmap(this.props.format) && selectedItems.length === 0) {
            getRaster().canvas = flipBitmapHorizontal(getRaster().canvas);
            this.props.onUpdateImage();
        } else {
            this._handleFlip(-1, 1, selectedItems);
        }
    }
    handleFlipVertical () {
        const selectedItems = getSelectedRootItems();
        if (isBitmap(this.props.format) && selectedItems.length === 0) {
            getRaster().canvas = flipBitmapVertical(getRaster().canvas);
            this.props.onUpdateImage();
        } else {
            this._handleFlip(1, -1, selectedItems);
        }
    }
    handleRotateClockwise () {
        if (isBitmap(this.props.format) && rotateBy(90)) {
            this.props.setSelectedItems(this.props.format);
            this.props.onUpdateImage();
        }
    }
    handleRotateCounterClockwise () {
        if (isBitmap(this.props.format) && rotateBy(-90)) {
            this.props.setSelectedItems(this.props.format);
            this.props.onUpdateImage();
        }
    }
    handlePasteFromClipboard () {
        if (this.props.onPasteFromClipboard()) {
            this.props.onUpdateImage();
        }
    }
    handleDelete () {
        if (!this.props.selectedItems.length) {
            if (isBitmap(this.props.format)) {
                selectAllBitmap(this.props.clearSelectedItems);
            } else if (this.props.mode === Modes.RESHAPE) {
                selectAllSegments();
            } else {
                selectAllItems();
            }
        }
        if (deleteSelection(this.props.mode, this.props.onUpdateImage)) {
            this.props.setSelectedItems(this.props.format);
        }
    }
    render () {
        const path = this.props.mode === Modes.RESHAPE ? this.getSelectedPath() : null;
        return (
            <ModeToolsComponent
                canClosePath={Boolean(path && !path.closed && path.segments.length >= 3)}
                canOpenPath={Boolean(path && path.closed)}
                canSplitPath={Boolean(this.getSplitSegment())}
                canJoinPaths={Boolean(this.getJoinPaths())}
                hasSelectedUncurvedPoints={this.hasSelectedUncurvedPoints()}
                hasSelectedUnpointedPoints={this.hasSelectedUnpointedPoints()}
                hasBitmapSelection={getSelectedRootItems().length > 0}
                onCopyToClipboard={this.props.onCopyToClipboard}
                onCurvePoints={this.handleCurvePoints}
                onClosePath={this.handleClosePath}
                onDelete={this.handleDelete}
                onFlipHorizontal={this.handleFlipHorizontal}
                onFlipVertical={this.handleFlipVertical}
                onRotateClockwise={this.handleRotateClockwise}
                onRotateCounterClockwise={this.handleRotateCounterClockwise}
                onPasteFromClipboard={this.handlePasteFromClipboard}
                onPointPoints={this.handlePointPoints}
                onOpenPath={this.handleOpenPath}
                onSplitPath={this.handleSplitPath}
                onJoinPaths={this.handleJoinPaths}
                onUpdateImage={this.props.onUpdateImage}
            />
        );
    }
}

ModeTools.propTypes = {
    intl: intlShape.isRequired,
    onEditorMenuActions: PropTypes.func,
    editorMenuOwner: PropTypes.string,
    clipboardItems: PropTypes.array,
    clearSelectedItems: PropTypes.func.isRequired,
    format: PropTypes.oneOf(Object.keys(Formats)),
    mode: PropTypes.oneOf(Object.keys(Modes)),
    onCopyToClipboard: PropTypes.func.isRequired,
    onPasteFromClipboard: PropTypes.func.isRequired,
    onUpdateImage: PropTypes.func.isRequired,
    // Listen on selected items to update hasSelectedPoints
    selectedItems:
        PropTypes.arrayOf(PropTypes.instanceOf(paper.Item)), // eslint-disable-line react/no-unused-prop-types
    setSelectedItems: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    format: state.scratchPaint.format,
    mode: state.scratchPaint.mode,
    selectedItems: state.scratchPaint.selectedItems,
    clipboardItems: state.scratchPaint.clipboard.items
});
const mapDispatchToProps = dispatch => ({
    clearSelectedItems: () => {
        dispatch(clearSelectedItems());
    },
    setSelectedItems: format => {
        dispatch(setSelectedItems(getSelectedLeafItems(), isBitmap(format)));
    }
});

export default injectIntl(CopyPasteHOC(connect(
    mapStateToProps,
    mapDispatchToProps
)(ModeTools)));
