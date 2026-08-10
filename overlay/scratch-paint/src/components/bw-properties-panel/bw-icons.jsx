import PropTypes from 'prop-types';
import React from 'react';

/**
 * Brickwright: icons for the properties rail, as inline SVG rather than imported .svg files.
 *
 * They are drawn in `currentColor` so a single CSS rule can grey them out when a button is
 * disabled — which matters here, because most of these buttons only apply to a selection of a
 * particular size (align needs two items, distribute needs three).
 *
 * All glyphs share a 20x20 box and the same 1.5 stroke weight as the stock scratch-paint icons.
 */

const svgProps = {
    height: '20',
    viewBox: '0 0 20 20',
    width: '20',
    xmlns: 'http://www.w3.org/2000/svg'
};

const edge = {stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: '1.5'};
const bar = {fill: 'currentColor', opacity: '0.55'};

/** Two bars of unequal length pulled against a guide line, so the effect of each align is legible. */
const alignIcon = (line, bars) => (
    <svg {...svgProps}>
        <line {...edge} {...line} />
        {bars.map((b, i) => <rect key={i} rx="1" {...bar} {...b} />)}
    </svg>
);

const AlignLeft = () => alignIcon(
    {x1: 3, y1: 3, x2: 3, y2: 17},
    [{x: 5, y: 5, width: 12, height: 4}, {x: 5, y: 11, width: 7, height: 4}]
);
const AlignHorizontalCenter = () => alignIcon(
    {x1: 10, y1: 3, x2: 10, y2: 17},
    [{x: 4, y: 5, width: 12, height: 4}, {x: 6.5, y: 11, width: 7, height: 4}]
);
const AlignRight = () => alignIcon(
    {x1: 17, y1: 3, x2: 17, y2: 17},
    [{x: 3, y: 5, width: 12, height: 4}, {x: 8, y: 11, width: 7, height: 4}]
);
const AlignTop = () => alignIcon(
    {x1: 3, y1: 3, x2: 17, y2: 3},
    [{x: 5, y: 5, width: 4, height: 12}, {x: 11, y: 5, width: 4, height: 7}]
);
const AlignVerticalCenter = () => alignIcon(
    {x1: 3, y1: 10, x2: 17, y2: 10},
    [{x: 5, y: 4, width: 4, height: 12}, {x: 11, y: 6.5, width: 4, height: 7}]
);
const AlignBottom = () => alignIcon(
    {x1: 3, y1: 17, x2: 17, y2: 17},
    [{x: 5, y: 3, width: 4, height: 12}, {x: 11, y: 8, width: 4, height: 7}]
);

/** Three bars with equal gaps — the outer two are the ones distribute holds still. */
const DistributeHorizontal = () => (
    <svg {...svgProps}>
        <rect {...bar} x="2" y="4" width="3" height="12" rx="1" />
        <rect {...bar} x="8.5" y="4" width="3" height="12" rx="1" />
        <rect {...bar} x="15" y="4" width="3" height="12" rx="1" />
    </svg>
);
const DistributeVertical = () => (
    <svg {...svgProps}>
        <rect {...bar} x="4" y="2" width="12" height="3" rx="1" />
        <rect {...bar} x="4" y="8.5" width="12" height="3" rx="1" />
        <rect {...bar} x="4" y="15" width="12" height="3" rx="1" />
    </svg>
);

/** Three-quarter circular arrow; the mirrored path gives the counter-clockwise twin. */
const rotateIcon = mirror => (
    <svg {...svgProps}>
        <g transform={mirror ? 'translate(20 0) scale(-1 1)' : undefined}>
            <path
                {...edge}
                d="M4.5 10a5.5 5.5 0 1 0 1.9-4.2"
                fill="none"
                strokeLinejoin="round"
            />
            <path
                d="M3.4 3.2v3.6h3.6z"
                fill="currentColor"
            />
        </g>
    </svg>
);
const RotateClockwise = () => rotateIcon(true);
const RotateCounterClockwise = () => rotateIcon(false);

/** Padlock for the aspect-ratio toggle: shackle up when free, shut when locked. */
const AspectLock = ({locked}) => (
    <svg {...svgProps}>
        <path
            {...edge}
            d={locked ? 'M7 9V6.5a3 3 0 0 1 6 0V9' : 'M7 9V6.5a3 3 0 0 1 6 0'}
            fill="none"
        />
        <rect {...bar} x="4.5" y="9" width="11" height="8" rx="1.5" opacity="0.8" />
    </svg>
);

/** Chevron for the rail's collapse toggle. */
const Chevron = ({pointsRight}) => (
    <svg {...svgProps}>
        <path
            {...edge}
            d={pointsRight ? 'M8 5l5 5-5 5' : 'M12 5l-5 5 5 5'}
            fill="none"
            strokeLinejoin="round"
        />
    </svg>
);

AspectLock.propTypes = {
    locked: PropTypes.bool
};
Chevron.propTypes = {
    pointsRight: PropTypes.bool
};

export {
    AlignBottom,
    AlignHorizontalCenter,
    AlignLeft,
    AlignRight,
    AlignTop,
    AlignVerticalCenter,
    AspectLock,
    Chevron,
    DistributeHorizontal,
    DistributeVertical,
    RotateClockwise,
    RotateCounterClockwise
};
