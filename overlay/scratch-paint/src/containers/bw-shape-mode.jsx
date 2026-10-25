import paper from '@scratch/paper';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import bindAll from 'lodash.bindall';

import Modes from '../lib/modes';
import {MIXED} from '../helper/style-path';
import ColorStyleProptype from '../lib/color-style-proptype';
import GradientTypes from '../lib/gradient-types';

import {changeFillColor, clearFillGradient, DEFAULT_COLOR} from '../reducers/fill-style';
import {changeStrokeColor, clearStrokeGradient} from '../reducers/stroke-style';
import {changeMode} from '../reducers/modes';
import {clearSelectedItems, setSelectedItems} from '../reducers/selected-items';
import {setCursor} from '../reducers/cursor';

import {clearSelection, getSelectedLeafItems} from '../helper/selection';
import {makePolygon, makeStar} from '../helper/bw/shapes';
import BwShapeTool from '../helper/tools/bw-shape-tool';
import BwShapeModeComponent, {Shapes} from '../components/bw-shape-mode/bw-shape-mode.jsx';

/**
 * Brickwright: containers for the parametric shape tools.
 *
 * Upstream copy-pastes the whole of validateColorState into every shape container, with a
 * standing "TODO move to shared class" on each copy. Rather than add two more, the container is
 * written once here and specialised per mode by a factory.
 */

/**
 * Make sure at least one of fill/stroke is set, and that MIXED is not one of the colors, before a
 * drawing tool starts. Ported verbatim from rect-mode.jsx so the new tools behave identically.
 * @param {!object} props The container's props.
 */
const validateColorState = function (props) {
    const {strokeWidth} = props.colorState;
    const fillColor1 = props.colorState.fillColor.primary;
    let fillColor2 = props.colorState.fillColor.secondary;
    let fillGradient = props.colorState.fillColor.gradientType;
    const strokeColor1 = props.colorState.strokeColor.primary;
    let strokeColor2 = props.colorState.strokeColor.secondary;
    let strokeGradient = props.colorState.strokeColor.gradientType;

    if (fillColor2 === MIXED) {
        props.clearFillGradient();
        fillColor2 = null;
        fillGradient = GradientTypes.SOLID;
    }
    if (strokeColor2 === MIXED) {
        props.clearStrokeGradient();
        strokeColor2 = null;
        strokeGradient = GradientTypes.SOLID;
    }

    const fillColorMissing = fillColor1 === MIXED ||
        (fillGradient === GradientTypes.SOLID && fillColor1 === null) ||
        (fillGradient !== GradientTypes.SOLID && fillColor1 === null && fillColor2 === null);
    const strokeColorMissing = strokeColor1 === MIXED ||
        strokeWidth === null ||
        strokeWidth === 0 ||
        (strokeGradient === GradientTypes.SOLID && strokeColor1 === null) ||
        (strokeGradient !== GradientTypes.SOLID && strokeColor1 === null && strokeColor2 === null);

    if (fillColorMissing && strokeColorMissing) {
        props.onChangeFillColor(DEFAULT_COLOR);
        props.clearFillGradient();
        props.onChangeStrokeColor(null);
        props.clearStrokeGradient();
    } else if (fillColorMissing && !strokeColorMissing) {
        props.onChangeFillColor(null);
        props.clearFillGradient();
    } else if (!fillColorMissing && strokeColorMissing) {
        props.onChangeStrokeColor(null);
        props.clearStrokeGradient();
    }
};

/**
 * @param {!string} mode The Modes entry this tool serves.
 * @param {!string} shape The Shapes entry naming its icon and label.
 * @param {!function} buildPath (paper.Rectangle, shapeParams) => paper.Path
 * @return {React.Component} The connected mode container.
 */
const makeShapeMode = function (mode, shape, buildPath) {
    class BwShapeMode extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, ['activateTool', 'deactivateTool']);
        }
        componentDidMount () {
            if (this.props.isActive) {
                this.activateTool();
            }
        }
        componentWillReceiveProps (nextProps) {
            if (this.tool && nextProps.colorState !== this.props.colorState) {
                this.tool.setColorState(nextProps.colorState);
            }
            if (this.tool && nextProps.shapeParams !== this.props.shapeParams) {
                this.tool.setParams(nextProps.shapeParams);
            }
            if (this.tool && nextProps.selectedItems !== this.props.selectedItems) {
                this.tool.onSelectionChanged(nextProps.selectedItems);
            }

            if (nextProps.isActive && !this.props.isActive) {
                this.activateTool();
            } else if (!nextProps.isActive && this.props.isActive) {
                this.deactivateTool();
            }
        }
        shouldComponentUpdate (nextProps) {
            return nextProps.isActive !== this.props.isActive;
        }
        componentWillUnmount () {
            if (this.tool) {
                this.deactivateTool();
            }
        }
        activateTool () {
            clearSelection(this.props.clearSelectedItems);
            validateColorState(this.props);

            this.tool = new BwShapeTool(
                mode,
                buildPath,
                this.props.setSelectedItems,
                this.props.clearSelectedItems,
                this.props.setCursor,
                this.props.onUpdateImage
            );
            this.tool.setColorState(this.props.colorState);
            this.tool.setParams(this.props.shapeParams);
            this.tool.activate();
        }
        deactivateTool () {
            this.tool.deactivateTool();
            this.tool.remove();
            this.tool = null;
        }
        render () {
            return (
                <BwShapeModeComponent
                    isSelected={this.props.isActive}
                    shape={shape}
                    onMouseDown={this.props.handleMouseDown}
                />
            );
        }
    }

    BwShapeMode.propTypes = {
        clearFillGradient: PropTypes.func.isRequired,
        clearSelectedItems: PropTypes.func.isRequired,
        clearStrokeGradient: PropTypes.func.isRequired,
        colorState: PropTypes.shape({
            fillColor: ColorStyleProptype,
            strokeColor: ColorStyleProptype,
            strokeWidth: PropTypes.number
        }).isRequired,
        handleMouseDown: PropTypes.func.isRequired,
        isActive: PropTypes.bool.isRequired,
        onChangeFillColor: PropTypes.func.isRequired,
        onChangeStrokeColor: PropTypes.func.isRequired,
        onUpdateImage: PropTypes.func.isRequired,
        selectedItems: PropTypes.arrayOf(PropTypes.instanceOf(paper.Item)),
        shapeParams: PropTypes.object.isRequired,
        setCursor: PropTypes.func.isRequired,
        setSelectedItems: PropTypes.func.isRequired
    };

    const mapStateToProps = state => ({
        colorState: state.scratchPaint.color,
        isActive: state.scratchPaint.mode === mode,
        selectedItems: state.scratchPaint.selectedItems,
        shapeParams: state.scratchPaint.bwShape
    });
    const mapDispatchToProps = dispatch => ({
        clearSelectedItems: () => {
            dispatch(clearSelectedItems());
        },
        clearFillGradient: () => {
            dispatch(clearFillGradient());
        },
        clearStrokeGradient: () => {
            dispatch(clearStrokeGradient());
        },
        setSelectedItems: () => {
            dispatch(setSelectedItems(getSelectedLeafItems(), false /* bitmapMode */));
        },
        setCursor: cursorString => {
            dispatch(setCursor(cursorString));
        },
        handleMouseDown: () => {
            dispatch(changeMode(mode));
        },
        onChangeFillColor: fillColor => {
            dispatch(changeFillColor(fillColor));
        },
        onChangeStrokeColor: strokeColor => {
            dispatch(changeStrokeColor(strokeColor));
        }
    });

    return connect(mapStateToProps, mapDispatchToProps)(BwShapeMode);
};

const PolygonMode = makeShapeMode(
    Modes.POLYGON,
    Shapes.POLYGON,
    (rect, params) => makePolygon(rect, params.polygonSides)
);
const StarMode = makeShapeMode(
    Modes.STAR,
    Shapes.STAR,
    (rect, params) => makeStar(rect, params.starPoints, params.starInnerRatio)
);

export {
    PolygonMode,
    StarMode
};
