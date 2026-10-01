import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';
import Modes from '../lib/modes';

import {changeMode} from '../reducers/modes';
import {clearHoveredItem, setHoveredItem} from '../reducers/hover';
import {clearSelectedItems, setSelectedItems} from '../reducers/selected-items';
import {getSelectedLeafItems} from '../helper/selection';

import ReshapeTool from '../helper/selection-tools/reshape-tool';
import ReshapeModeComponent from '../components/reshape-mode/reshape-mode.jsx';

class ReshapeMode extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'activateTool',
            'deactivateTool'
        ]);
    }
    componentDidMount () {
        if (this.props.isReshapeModeActive) {
            this.activateTool(this.props);
        }
    }
    componentWillReceiveProps (nextProps) {
        if (this.tool && nextProps.hoveredItemId !== this.props.hoveredItemId) {
            this.tool.setPrevHoveredItemId(nextProps.hoveredItemId);
        }
        if (this.tool && nextProps.independentHandles !== this.props.independentHandles) {
            this.tool.setIndependentHandles(nextProps.independentHandles);
        }

        if (nextProps.isReshapeModeActive && !this.props.isReshapeModeActive) {
            this.activateTool(nextProps);
        } else if (!nextProps.isReshapeModeActive && this.props.isReshapeModeActive) {
            this.deactivateTool();
        }
    }
    shouldComponentUpdate (nextProps) {
        return nextProps.isReshapeModeActive !== this.props.isReshapeModeActive;
    }
    componentWillUnmount () {
        if (this.tool) {
            this.deactivateTool();
        }
    }
    activateTool (props = this.props) {
        this.tool = new ReshapeTool(
            props.setHoveredItem,
            props.clearHoveredItem,
            props.setSelectedItems,
            props.clearSelectedItems,
            props.onUpdateImage,
            props.switchToTextTool
        );
        this.tool.setPrevHoveredItemId(props.hoveredItemId);
        this.tool.setIndependentHandles(props.independentHandles);
        this.tool.activate();
    }
    deactivateTool () {
        this.tool.deactivateTool();
        this.tool.remove();
        this.tool = null;
        this.hitResult = null;
    }
    render () {
        return (
            <ReshapeModeComponent
                isSelected={this.props.isReshapeModeActive}
                onMouseDown={this.props.handleMouseDown}
            />
        );
    }
}

ReshapeMode.propTypes = {
    clearHoveredItem: PropTypes.func.isRequired,
    clearSelectedItems: PropTypes.func.isRequired,
    handleMouseDown: PropTypes.func.isRequired,
    hoveredItemId: PropTypes.number,
    independentHandles: PropTypes.bool.isRequired,
    isReshapeModeActive: PropTypes.bool.isRequired,
    onUpdateImage: PropTypes.func.isRequired,
    setHoveredItem: PropTypes.func.isRequired,
    setSelectedItems: PropTypes.func.isRequired,
    switchToTextTool: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    isReshapeModeActive: state.scratchPaint.mode === Modes.RESHAPE,
    hoveredItemId: state.scratchPaint.hoveredItemId,
    independentHandles: state.scratchPaint.bwIndependentHandles
});
const mapDispatchToProps = dispatch => ({
    setHoveredItem: hoveredItemId => {
        dispatch(setHoveredItem(hoveredItemId));
    },
    clearHoveredItem: () => {
        dispatch(clearHoveredItem());
    },
    clearSelectedItems: () => {
        dispatch(clearSelectedItems());
    },
    setSelectedItems: () => {
        dispatch(setSelectedItems(getSelectedLeafItems(), false /* bitmapMode */));
    },
    handleMouseDown: () => {
        dispatch(changeMode(Modes.RESHAPE));
    },
    switchToTextTool: () => {
        dispatch(changeMode(Modes.TEXT));
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ReshapeMode);
