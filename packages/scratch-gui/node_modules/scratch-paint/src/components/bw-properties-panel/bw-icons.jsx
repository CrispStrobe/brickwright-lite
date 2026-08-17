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

/*
 * Boolean-op glyphs. Each is the same two overlapping shapes — a square and a circle — with only
 * the shading changed, so the icons read as a set and each one shows exactly which regions the
 * operation keeps. The outline of both operands always stays visible, or "keep nothing but the
 * overlap" would look identical to "delete everything".
 */
const SQUARE = {x: 3.5, y: 5.5, width: 9, height: 9};
const CIRCLE = {cx: 12.5, cy: 11, r: 4.8};
const outline = {fill: 'none', stroke: 'currentColor', strokeWidth: '1.3', opacity: '0.65'};
const solid = {fill: 'currentColor', opacity: '0.55'};

/**
 * @param {!React.ReactNode} filled The shaded regions, drawn under the outlines.
 * @return {!React.ReactElement} The finished two-operand glyph.
 */
const booleanIcon = filled => (
    <svg {...svgProps}>
        {filled}
        <rect {...outline} {...SQUARE} rx="1" />
        <circle {...outline} {...CIRCLE} />
    </svg>
);

const Unite = () => booleanIcon(
    <g {...solid}>
        <rect {...SQUARE} rx="1" />
        <circle {...CIRCLE} />
    </g>
);
/* The circle is punched out of the square, so the shaded square is clipped by a mask. */
const Subtract = () => (
    <svg {...svgProps}>
        <mask id="bw-subtract-mask">
            <rect x="0" y="0" width="20" height="20" fill="black" />
            <rect {...SQUARE} rx="1" fill="white" />
            <circle {...CIRCLE} fill="black" />
        </mask>
        <rect x="0" y="0" width="20" height="20" mask="url(#bw-subtract-mask)" {...solid} />
        <rect {...outline} {...SQUARE} rx="1" />
        <circle {...outline} {...CIRCLE} />
    </svg>
);
/* Only the lens where the two meet. */
const Intersect = () => (
    <svg {...svgProps}>
        <mask id="bw-intersect-mask">
            <rect {...SQUARE} rx="1" fill="white" />
        </mask>
        <circle {...CIRCLE} mask="url(#bw-intersect-mask)" {...solid} />
        <rect {...outline} {...SQUARE} rx="1" />
        <circle {...outline} {...CIRCLE} />
    </svg>
);
/* Everything except the lens: paint the union white, then punch the overlap back out in black. */
const Exclude = () => (
    <svg {...svgProps}>
        <defs>
            <clipPath id="bw-exclude-clip">
                <rect {...SQUARE} rx="1" />
            </clipPath>
        </defs>
        <mask id="bw-exclude-mask">
            <rect {...SQUARE} rx="1" fill="white" />
            <circle {...CIRCLE} fill="white" />
            <circle
                {...CIRCLE}
                clipPath="url(#bw-exclude-clip)"
                fill="black"
            />
        </mask>
        <rect x="0" y="0" width="20" height="20" mask="url(#bw-exclude-mask)" {...solid} />
        <rect {...outline} {...SQUARE} rx="1" />
        <circle {...outline} {...CIRCLE} />
    </svg>
);
/* All three regions kept, drawn apart to show they are now separate objects. */
const Divide = () => (
    <svg {...svgProps}>
        <rect {...solid} x="2.5" y="5.5" width="8" height="9" rx="1" />
        <circle {...solid} cx="14" cy="11" r="4.4" />
        <rect {...outline} x="2.5" y="5.5" width="8" height="9" rx="1" />
        <circle {...outline} cx="14" cy="11" r="4.4" />
    </svg>
);

/** Mirror: a shape, its axis, and the reflected copy. */
const mirrorIcon = vertical => (
    <svg {...svgProps}>
        <g transform={vertical ? 'rotate(90 10 10)' : undefined}>
            <path {...solid} d="M9 4.5v11H4l5-11z" />
            <path {...outline} d="M11 4.5v11h5l-5-11z" />
            <line
                {...edge}
                strokeDasharray="2 2"
                x1="10"
                y1="2.5"
                x2="10"
                y2="17.5"
            />
        </g>
    </svg>
);
const MirrorHorizontal = () => mirrorIcon(false);
const MirrorVertical = () => mirrorIcon(true);

/** Eye for the objects tree's show/hide toggle; struck through when the object is hidden. */
const Eye = ({closed}) => (
    <svg {...svgProps}>
        <path
            {...edge}
            d="M2.5 10s3-4.5 7.5-4.5S17.5 10 17.5 10s-3 4.5-7.5 4.5S2.5 10 2.5 10z"
            fill="none"
            strokeLinejoin="round"
        />
        <circle {...solid} cx="10" cy="10" r="2.2" />
        {closed ? (
            <line
                {...edge}
                x1="4"
                y1="16"
                x2="16"
                y2="4"
            />
        ) : null}
    </svg>
);

/** Padlock for the objects tree's lock toggle: open shackle when unlocked. */
const Padlock = ({locked}) => (
    <svg {...svgProps}>
        <path
            {...edge}
            d={locked ? 'M7 9V6.5a3 3 0 0 1 6 0V9' : 'M7 9V6.5a3 3 0 0 1 6 0'}
            fill="none"
        />
        <rect
            {...(locked ? solid : outline)}
            x="4.5"
            y="9"
            width="11"
            height="8"
            rx="1.5"
        />
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
Eye.propTypes = {
    closed: PropTypes.bool
};
Padlock.propTypes = {
    locked: PropTypes.bool
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
    Divide,
    Exclude,
    Eye,
    Intersect,
    Padlock,
    MirrorHorizontal,
    MirrorVertical,
    RotateClockwise,
    RotateCounterClockwise,
    Subtract,
    Unite
};
