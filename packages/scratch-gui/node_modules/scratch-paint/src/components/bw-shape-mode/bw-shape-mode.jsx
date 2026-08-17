import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages} from 'react-intl';
import ToolSelectComponent from '../tool-select-base/tool-select-base.jsx';

import polygonIcon from './polygon.svg';
import starIcon from './star.svg';

/**
 * Brickwright: the toolbar buttons for the parametric shape tools.
 *
 * These go through react-intl like the stock tool buttons do (ToolSelectComponent formats the
 * descriptor itself for both the tooltip and the alt text). scratch-l10n has no translations for
 * our ids, so they render the English default — the rest of our UI strings live in
 * lib/bw-messages.js instead, but a tool button has to speak ToolSelectComponent's language.
 */
const messages = defineMessages({
    polygon: {
        defaultMessage: 'Polygon',
        description: 'Label for the polygon tool',
        id: 'paint.bwShapeMode.polygon'
    },
    star: {
        defaultMessage: 'Star',
        description: 'Label for the star tool',
        id: 'paint.bwShapeMode.star'
    }
});

const Shapes = {
    POLYGON: 'polygon',
    STAR: 'star'
};

const icons = {
    [Shapes.POLYGON]: polygonIcon,
    [Shapes.STAR]: starIcon
};

const BwShapeModeComponent = props => (
    <ToolSelectComponent
        imgDescriptor={messages[props.shape]}
        imgSrc={icons[props.shape]}
        isSelected={props.isSelected}
        onMouseDown={props.onMouseDown}
    />
);

BwShapeModeComponent.propTypes = {
    isSelected: PropTypes.bool.isRequired,
    onMouseDown: PropTypes.func.isRequired,
    shape: PropTypes.oneOf([Shapes.POLYGON, Shapes.STAR]).isRequired
};

export {
    BwShapeModeComponent as default,
    Shapes
};
