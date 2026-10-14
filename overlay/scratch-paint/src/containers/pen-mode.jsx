import paper from '@scratch/paper';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';

import Modes from '../lib/modes';
import messages from '../lib/messages';
import ColorStyleProptype from '../lib/color-style-proptype';
import {clearSelection, getSelectedLeafItems} from '../helper/selection';
import {getGuideLayer} from '../helper/layer';
import {snapPointToGrid} from '../helper/bw/grid';
import {styleShape, MIXED} from '../helper/style-path';
import {changeStrokeColor, clearStrokeGradient} from '../reducers/stroke-style';
import {changeStrokeWidth} from '../reducers/stroke-width';
import {changeMode} from '../reducers/modes';
import {clearSelectedItems, setSelectedItems} from '../reducers/selected-items';
import ToolSelectComponent from '../components/tool-select-base/tool-select-base.jsx';
import penIcon from '../components/pen-mode/pen.svg';
import finishIcon from '../components/pen-mode/finish.svg';

/** A click places a corner; dragging that click creates symmetric Bézier handles. */
class PenMode extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'activateTool', 'deactivateTool', 'handleToolButton', 'handleKeyDown',
            'handleMouseDown', 'handleMouseDrag', 'handleMouseMove', 'handleMouseUp'
        ]);
        this.path = null;
        this.segment = null;
        this.preview = null;
        this.state = {draft: false};
    }
    componentDidMount () {
        if (this.props.isActive) this.activateTool();
    }
    componentWillReceiveProps (nextProps) {
        if (nextProps.isActive && !this.props.isActive) this.activateTool();
        else if (!nextProps.isActive && this.props.isActive) this.deactivateTool();
    }
    shouldComponentUpdate (nextProps, nextState) {
        return nextProps.isActive !== this.props.isActive || nextState.draft !== this.state.draft;
    }
    componentWillUnmount () {
        this.unmounting = true;
        if (this.tool) this.deactivateTool();
    }
    activateTool () {
        clearSelection(this.props.clearSelectedItems);
        const stroke = this.props.colorState.strokeColor;
        if (stroke.primary === MIXED ||
            (stroke.primary === null && (stroke.secondary === null || stroke.secondary === MIXED))) {
            this.props.onChangeStrokeColor('#000000');
        }
        if (stroke.secondary === MIXED) this.props.clearStrokeGradient();
        if (!this.props.colorState.strokeWidth) this.props.onChangeStrokeWidth(1);

        this.tool = new paper.Tool();
        this.tool.onMouseDown = this.handleMouseDown;
        this.tool.onMouseDrag = this.handleMouseDrag;
        this.tool.onMouseMove = this.handleMouseMove;
        this.tool.onMouseUp = this.handleMouseUp;
        this.tool.activate();
        document.addEventListener('keydown', this.handleKeyDown, true);
    }
    removePreview () {
        if (this.preview) this.preview.remove();
        this.preview = null;
    }
    finish (commit) {
        this.removePreview();
        this.segment = null;
        if (!this.path) return;
        const path = this.path;
        this.path = null;
        if (this.state.draft && !this.unmounting) this.setState({draft: false});
        if (!commit || path.segments.length < 2) {
            path.remove();
            return;
        }
        path.selected = true;
        this.props.setSelectedItems();
        this.props.onUpdateImage();
    }
    deactivateTool () {
        document.removeEventListener('keydown', this.handleKeyDown, true);
        this.finish(true);
        this.tool.remove();
        this.tool = null;
    }
    handleToolButton () {
        if (this.props.isActive) this.finish(true);
        else this.props.changeMode();
    }
    handleKeyDown (event) {
        if (!this.path || (event.key !== 'Enter' && event.key !== 'Escape')) return;
        event.preventDefault();
        event.stopPropagation();
        this.finish(event.key === 'Enter');
    }
    handleMouseDown (event) {
        if (event.event.button > 0) return;
        const point = snapPointToGrid(event.point);
        if (this.path && this.path.segments.length >= 3 &&
            point.getDistance(this.path.firstSegment.point) <= 12 / paper.view.zoom) {
            this.path.closed = true;
            this.finish(true);
            return;
        }
        if (this.path && point.getDistance(this.path.lastSegment.point) <= 2 / paper.view.zoom) return;
        if (!this.path) {
            clearSelection(this.props.clearSelectedItems);
            this.path = new paper.Path();
            this.path.strokeCap = 'round';
            styleShape(this.path, {
                fillColor: null,
                strokeColor: this.props.colorState.strokeColor,
                strokeWidth: this.props.colorState.strokeWidth || 1
            });
        }
        this.removePreview();
        this.segment = this.path.add(point);
        this.path.selected = true;
        if (!this.state.draft) this.setState({draft: true});
    }
    handleMouseDrag (event) {
        if (event.event.button > 0 || !this.segment) return;
        const delta = snapPointToGrid(event.point).subtract(this.segment.point);
        this.segment.handleOut = delta;
        this.segment.handleIn = delta.multiply(-1);
    }
    handleMouseUp () {
        this.segment = null;
    }
    handleMouseMove (event) {
        if (!this.path || this.segment) return;
        const point = snapPointToGrid(event.point);
        if (!this.preview) {
            this.preview = new paper.Path.Line(this.path.lastSegment.point, point);
            this.preview.parent = getGuideLayer();
            this.preview.guide = true;
            this.preview.data.isHelperItem = true;
            this.preview.strokeColor = '#855CD6';
            this.preview.strokeWidth = 1;
            this.preview.dashArray = [4, 4];
        } else {
            this.preview.firstSegment.point = this.path.lastSegment.point;
            this.preview.lastSegment.point = point;
        }
    }
    render () {
        return <ToolSelectComponent
            imgDescriptor={this.state.draft ? messages.finishPath : messages.pen}
            imgSrc={this.state.draft ? finishIcon : penIcon}
            isSelected={this.props.isActive}
            onMouseDown={this.handleToolButton}
        />;
    }
}

PenMode.propTypes = {
    changeMode: PropTypes.func.isRequired,
    clearSelectedItems: PropTypes.func.isRequired,
    clearStrokeGradient: PropTypes.func.isRequired,
    colorState: PropTypes.shape({
        strokeColor: ColorStyleProptype,
        strokeWidth: PropTypes.number
    }).isRequired,
    isActive: PropTypes.bool.isRequired,
    onChangeStrokeColor: PropTypes.func.isRequired,
    onChangeStrokeWidth: PropTypes.func.isRequired,
    onUpdateImage: PropTypes.func.isRequired,
    setSelectedItems: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    colorState: state.scratchPaint.color,
    isActive: state.scratchPaint.mode === Modes.PEN
});
const mapDispatchToProps = dispatch => ({
    changeMode: () => dispatch(changeMode(Modes.PEN)),
    clearSelectedItems: () => dispatch(clearSelectedItems()),
    clearStrokeGradient: () => dispatch(clearStrokeGradient()),
    onChangeStrokeColor: color => dispatch(changeStrokeColor(color)),
    onChangeStrokeWidth: width => dispatch(changeStrokeWidth(width)),
    setSelectedItems: () => dispatch(setSelectedItems(getSelectedLeafItems(), false))
});

export default connect(mapStateToProps, mapDispatchToProps)(PenMode);
