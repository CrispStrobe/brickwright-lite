import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import {clearGrid, drawGrid, setGridSettings} from '../helper/bw/grid';

/**
 * Brickwright: keeps the drawn grid in step with the grid settings, and keeps helper/bw/grid.js's
 * module-level copy of those settings in step with redux so the drawing tools can consult them
 * without every tool container having to carry them (see the note in helper/bw/grid.js).
 *
 * Renders nothing — its whole job is the side effect on the paper guide layer.
 *
 * It redraws on `viewBounds` as well as on the settings, for two reasons: the grid's stroke width
 * is divided by the zoom to stay hairline, and switching costumes rebuilds paper's layers, which
 * throws the grid away. viewBounds changes on both, so both are covered.
 */
class BwGridLayer extends React.Component {
    componentDidMount () {
        this.sync();
    }
    componentDidUpdate () {
        this.sync();
    }
    componentWillUnmount () {
        clearGrid();
    }
    sync () {
        setGridSettings(this.props.grid);
        drawGrid();
    }
    render () {
        return null;
    }
}

BwGridLayer.propTypes = {
    grid: PropTypes.shape({
        size: PropTypes.number,
        smartGuides: PropTypes.bool,
        snapToGrid: PropTypes.bool,
        visible: PropTypes.bool
    }).isRequired,
    // Not read — it is the signal that the zoom changed or the layers were rebuilt.
    // eslint-disable-next-line react/no-unused-prop-types
    viewBounds: PropTypes.object
};

const mapStateToProps = state => ({
    grid: state.scratchPaint.bwGrid,
    viewBounds: state.scratchPaint.viewBounds
});

export default connect(mapStateToProps)(BwGridLayer);
