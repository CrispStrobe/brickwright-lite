/**
 * FieldLed8x8 — an 8x8 grayscale matrix field for the A2 dot matrix.
 *
 * Painted like the micro:bit "show leds" grid, but 8x8 and with
 * BRIGHTNESS: each cell cycles four levels on click (off -> dim -> mid
 * -> full), rendered as increasing whiteness. The value is a 64-char
 * string of digits '0'..'3', row-major, row 0 top / column 0 left —
 * exactly the BrickWright IMAGE literal (docs/A2-BOARD-SUPPORT.md), so
 * what the learner paints is what `show image` blits into the frame
 * buffer the Timer-0 ISR scans.
 *
 * Registered at runtime against the already-loaded scratch-blocks object
 * (see lazy-scratch-blocks.js), the same way the comment-bubble guard
 * patches Blockly there — no scratch-blocks recompile. Derived from
 * scratch-blocks' Blockly.FieldMatrix (Apache-2.0, MIT/Media Lab); the
 * differences are the 8x8 geometry, the 4-level cycle in place of a
 * binary toggle, and the level->whiteness fill ramp.
 *
 * A `led8x8` shadow block (defined here too) carries the field, and
 * scratch-vm's ArgumentTypeMap maps the `led8x8` argument type onto that
 * shadow (see scripts/apply-vm-overlay.mjs) — the exact mechanism
 * micro:bit uses for its MATRIX argument.
 */

const DIM = 8;
const CELLS = 64;
const LEVELS = 3;                 // levels run 0..LEVELS (4 total)
const ZEROS = '0'.repeat(CELLS);
const FULL = String(LEVELS).repeat(CELLS);

const THUMBNAIL_SIZE = 26;
const THUMBNAIL_NODE_SIZE = 2;
const THUMBNAIL_NODE_PAD = 1;
const ARROW_SIZE = 12;
const MATRIX_NODE_SIZE = 14;
const MATRIX_NODE_RADIUS = 3;
const MATRIX_NODE_PAD = 4;

// The devices-extension palette colour, so the dropdown and thumbnail
// read as part of that category.
const DEVICES_COLOUR = '#CF6A1D';
const DEVICES_COLOUR_SECONDARY = '#C0611A';
const DEVICES_COLOUR_TERTIARY = '#B05A18';

let registered = false;

/**
 * Define Blockly.FieldLed8x8 on the loaded scratch-blocks object and the
 * `led8x8` shadow block. Idempotent.
 * @param {!Object} SB The loaded scratch-blocks (Blockly) object.
 */
const registerFieldLed8x8 = SB => {
    if (registered || !SB || SB.FieldLed8x8) {
        return;
    }
    if (!SB.Field || !SB.utils || !SB.DropDownDiv) {
        return; // Not a shape we recognize; fail safe rather than throw.
    }

    /**
     * @param {string} matrix 64 digits '0'..'3'.
     * @constructor
     * @extends {Blockly.Field}
     */
    const FieldLed8x8 = function (matrix) {
        FieldLed8x8.superClass_.constructor.call(this, matrix);
        this.addArgType('led8x8');
        this.ledThumbNodes_ = [];
        this.ledButtons_ = [];
        this.matrix_ = '';
        this.matrixStage_ = null;
        this.arrow_ = null;
        this.paintLevel_ = null;
        this.mouseDownWrapper_ = null;
        this.clearButtonWrapper_ = null;
        this.fillButtonWrapper_ = null;
        this.matrixTouchWrapper_ = null;
        this.matrixMoveWrapper_ = null;
        this.matrixReleaseWrapper_ = null;
    };

    // Manual prototype inheritance — do not rely on a global `goog`.
    FieldLed8x8.superClass_ = SB.Field.prototype;
    FieldLed8x8.prototype = Object.create(SB.Field.prototype);
    FieldLed8x8.prototype.constructor = FieldLed8x8;

    FieldLed8x8.fromJson = options => new FieldLed8x8(options.matrix);

    /**
     * Coerce any value to exactly CELLS chars, each digit '0'..'LEVELS'.
     * Out-of-range / short / non-digit input is clamped and right-padded
     * with '0' so the render loop can never throw on a hand-typed value.
     * @param {string} matrix Candidate value.
     * @return {string} Clean CELLS-char value.
     */
    FieldLed8x8.prototype.normalize_ = function (matrix) {
        const s = String(matrix || '');
        let out = '';
        for (let i = 0; i < CELLS; i++) {
            let c = s.charCodeAt(i) - 48; // '0' -> 0
            if (!(c >= 0 && c <= LEVELS)) {
                c = c > LEVELS ? LEVELS : 0;
            }
            out += String(c);
        }
        return out;
    };

    FieldLed8x8.prototype.init = function () {
        if (this.fieldGroup_) {
            return;
        }
        this.fieldGroup_ = SB.utils.createSvgElement('g', {}, null);
        this.size_.width = THUMBNAIL_SIZE + ARROW_SIZE +
            (SB.BlockSvg.DROPDOWN_ARROW_PADDING * 1.5);
        this.sourceBlock_.getSvgRoot().appendChild(this.fieldGroup_);

        const thumbX = SB.BlockSvg.DROPDOWN_ARROW_PADDING / 2;
        const thumbY = (this.size_.height - THUMBNAIL_SIZE) / 2;
        const thumbnail = SB.utils.createSvgElement('g', {
            'transform': `translate(${thumbX}, ${thumbY})`,
            'pointer-events': 'bounding-box', 'cursor': 'pointer'
        }, this.fieldGroup_);
        this.ledThumbNodes_ = [];
        const nodeSize = THUMBNAIL_NODE_SIZE;
        const nodePad = THUMBNAIL_NODE_PAD;
        for (let i = 0; i < DIM; i++) {
            for (let n = 0; n < DIM; n++) {
                this.ledThumbNodes_.push(SB.utils.createSvgElement('rect', {
                    'x': ((nodeSize + nodePad) * n) + nodePad,
                    'y': ((nodeSize + nodePad) * i) + nodePad,
                    'width': nodeSize, 'height': nodeSize,
                    'rx': nodePad, 'ry': nodePad
                }, thumbnail));
            }
        }
        thumbnail.style.cursor = 'default';
        this.updateMatrix_();

        if (!this.arrow_) {
            const arrowX = THUMBNAIL_SIZE + SB.BlockSvg.DROPDOWN_ARROW_PADDING * 1.5;
            const arrowY = (this.size_.height - ARROW_SIZE) / 2;
            this.arrow_ = SB.utils.createSvgElement('image', {
                'height': `${ARROW_SIZE}px`, 'width': `${ARROW_SIZE}px`,
                'transform': `translate(${arrowX}, ${arrowY})`
            }, this.fieldGroup_);
            this.arrow_.setAttributeNS('http://www.w3.org/1999/xlink',
                'xlink:href', SB.mainWorkspace.options.pathToMedia +
                'dropdown-arrow.svg');
            this.arrow_.style.cursor = 'default';
        }

        this.mouseDownWrapper_ = SB.bindEventWithChecks_(
            this.getClickTarget_(), 'mousedown', this, this.onMouseDown_);
    };

    FieldLed8x8.prototype.setValue = function (matrix) {
        if (matrix === null || matrix === undefined) {
            return;
        }
        const clean = this.normalize_(matrix);
        if (clean === this.matrix_) {
            return;
        }
        if (this.sourceBlock_ && SB.Events.isEnabled()) {
            SB.Events.fire(new SB.Events.Change(
                this.sourceBlock_, 'field', this.name, this.matrix_, clean));
        }
        this.matrix_ = clean;
        this.updateMatrix_();
    };

    FieldLed8x8.prototype.getValue = function () {
        return String(this.matrix_);
    };

    /**
     * Fill for a brightness level: level 0 is the block's "off" colour;
     * levels 1..LEVELS are white at increasing opacity, so brightness
     * reads as whiteness regardless of the block's hue.
     */
    FieldLed8x8.prototype.levelFill_ = function (level, offColour) {
        if (level <= 0) {
            return {fill: offColour, opacity: 1};
        }
        return {fill: '#FFFFFF', opacity: level / LEVELS};
    };

    FieldLed8x8.prototype.showEditor_ = function () {
        SB.DropDownDiv.hideWithoutAnimation();
        SB.DropDownDiv.clearContent();
        const div = SB.DropDownDiv.getContentDiv();
        const matrixSize = (MATRIX_NODE_SIZE * DIM) + (MATRIX_NODE_PAD * (DIM + 1));
        this.matrixStage_ = SB.utils.createSvgElement('svg', {
            'xmlns': 'http://www.w3.org/2000/svg',
            'xmlns:html': 'http://www.w3.org/1999/xhtml',
            'xmlns:xlink': 'http://www.w3.org/1999/xlink',
            'version': '1.1',
            'height': `${matrixSize}px`, 'width': `${matrixSize}px`
        }, div);
        this.ledButtons_ = [];
        for (let i = 0; i < DIM; i++) {
            for (let n = 0; n < DIM; n++) {
                const x = (MATRIX_NODE_SIZE * n) + (MATRIX_NODE_PAD * (n + 1));
                const y = (MATRIX_NODE_SIZE * i) + (MATRIX_NODE_PAD * (i + 1));
                const led = SB.utils.createSvgElement('rect', {
                    'x': `${x}px`, 'y': `${y}px`,
                    'width': MATRIX_NODE_SIZE, 'height': MATRIX_NODE_SIZE,
                    'rx': MATRIX_NODE_RADIUS, 'ry': MATRIX_NODE_RADIUS
                }, this.matrixStage_);
                this.matrixStage_.appendChild(led);
                this.ledButtons_.push(led);
            }
        }
        // Clear (all off) and fill (all full) buttons.
        const buttonDiv = document.createElement('div');
        const clearButtonDiv = document.createElement('div');
        clearButtonDiv.className = 'scratchMatrixButtonDiv';
        const clearButton = this.createButton_(this.sourceBlock_.colourSecondary_);
        clearButtonDiv.appendChild(clearButton);
        const fillButtonDiv = document.createElement('div');
        fillButtonDiv.className = 'scratchMatrixButtonDiv';
        const fillButton = this.createButton_('#FFFFFF');
        fillButtonDiv.appendChild(fillButton);
        buttonDiv.appendChild(clearButtonDiv);
        buttonDiv.appendChild(fillButtonDiv);
        div.appendChild(buttonDiv);

        SB.DropDownDiv.setColour(this.sourceBlock_.getColour(),
            this.sourceBlock_.getColourTertiary());
        SB.DropDownDiv.setCategory(this.sourceBlock_.getCategory());
        SB.DropDownDiv.showPositionedByBlock(this, this.sourceBlock_);

        this.matrixTouchWrapper_ =
            SB.bindEvent_(this.matrixStage_, 'mousedown', this, this.onMouseDown);
        this.clearButtonWrapper_ =
            SB.bindEvent_(clearButton, 'click', this, this.clearMatrix_);
        this.fillButtonWrapper_ =
            SB.bindEvent_(fillButton, 'click', this, this.fillMatrix_);

        this.updateMatrix_();
    };

    FieldLed8x8.prototype.createButton_ = function (fill) {
        const button = SB.utils.createSvgElement('svg', {
            'xmlns': 'http://www.w3.org/2000/svg',
            'xmlns:html': 'http://www.w3.org/1999/xhtml',
            'xmlns:xlink': 'http://www.w3.org/1999/xlink',
            'version': '1.1',
            'height': `${MATRIX_NODE_SIZE}px`, 'width': `${MATRIX_NODE_SIZE}px`
        });
        const nodeSize = MATRIX_NODE_SIZE / 4;
        const nodePad = MATRIX_NODE_SIZE / 16;
        for (let i = 0; i < 3; i++) {
            for (let n = 0; n < 3; n++) {
                SB.utils.createSvgElement('rect', {
                    'x': ((nodeSize + nodePad) * n) + nodePad,
                    'y': ((nodeSize + nodePad) * i) + nodePad,
                    'width': nodeSize, 'height': nodeSize,
                    'rx': nodePad, 'ry': nodePad, 'fill': fill
                }, button);
            }
        }
        return button;
    };

    FieldLed8x8.prototype.updateMatrix_ = function () {
        for (let i = 0; i < this.matrix_.length; i++) {
            const level = this.matrix_.charCodeAt(i) - 48;
            this.fillMatrixNode_(this.ledButtons_, i,
                this.levelFill_(level, this.sourceBlock_.colourSecondary_));
            this.fillMatrixNode_(this.ledThumbNodes_, i,
                this.levelFill_(level, this.sourceBlock_.colour_));
        }
    };

    FieldLed8x8.prototype.clearMatrix_ = function (e) {
        if (e.button !== 0) return;
        this.setValue(ZEROS);
    };

    FieldLed8x8.prototype.fillMatrix_ = function (e) {
        if (e.button !== 0) return;
        this.setValue(FULL);
    };

    FieldLed8x8.prototype.fillMatrixNode_ = function (node, index, spec) {
        if (!node || !node[index] || !spec) return;
        node[index].setAttribute('fill', spec.fill);
        node[index].setAttribute('fill-opacity', spec.opacity);
    };

    FieldLed8x8.prototype.setLEDNode_ = function (led, level) {
        if (led < 0 || led >= CELLS) return;
        const digit = String(Math.max(0, Math.min(LEVELS, level)));
        this.setValue(this.matrix_.substr(0, led) + digit + this.matrix_.substr(led + 1));
    };

    FieldLed8x8.prototype.cycleLEDNode_ = function (led) {
        if (led < 0 || led >= CELLS) return 0;
        const level = this.matrix_.charCodeAt(led) - 48;
        const next = (level + 1) % (LEVELS + 1);
        this.setLEDNode_(led, next);
        return next;
    };

    FieldLed8x8.prototype.onMouseDown = function (e) {
        this.matrixMoveWrapper_ =
            SB.bindEvent_(document.body, 'mousemove', this, this.onMouseMove);
        this.matrixReleaseWrapper_ =
            SB.bindEvent_(document.body, 'mouseup', this, this.onMouseUp);
        const ledHit = this.checkForLED_(e);
        if (ledHit > -1) {
            this.paintLevel_ = this.cycleLEDNode_(ledHit);
            this.updateMatrix_();
        } else {
            this.paintLevel_ = null;
        }
    };

    FieldLed8x8.prototype.onMouseUp = function () {
        SB.unbindEvent_(this.matrixMoveWrapper_);
        SB.unbindEvent_(this.matrixReleaseWrapper_);
        this.paintLevel_ = null;
    };

    FieldLed8x8.prototype.onMouseMove = function (e) {
        e.preventDefault();
        if (this.paintLevel_ === null) return;
        const led = this.checkForLED_(e);
        if (led < 0) return;
        this.setLEDNode_(led, this.paintLevel_);
    };

    FieldLed8x8.prototype.checkForLED_ = function (e) {
        const bBox = this.matrixStage_.getBoundingClientRect();
        const dx = e.clientX - bBox.left;
        const dy = e.clientY - bBox.top;
        const min = MATRIX_NODE_PAD / 2;
        const max = bBox.width - (MATRIX_NODE_PAD / 2);
        if (dx < min || dx > max || dy < min || dy > max) {
            return -1;
        }
        const xDiv = Math.trunc((dx - MATRIX_NODE_PAD / 2) / (MATRIX_NODE_SIZE + MATRIX_NODE_PAD));
        const yDiv = Math.trunc((dy - MATRIX_NODE_PAD / 2) / (MATRIX_NODE_SIZE + MATRIX_NODE_PAD));
        if (xDiv < 0 || xDiv >= DIM || yDiv < 0 || yDiv >= DIM) {
            return -1;
        }
        // Row-major index: row times the grid WIDTH. (Upstream FieldMatrix
        // multiplies by the pad, which is only correct at 5x5 where pad ==
        // width; that latent bug would scramble an 8x8.)
        return xDiv + (yDiv * DIM);
    };

    FieldLed8x8.prototype.dispose_ = function () {
        const thisField = this;
        return function () {
            FieldLed8x8.superClass_.dispose_.call(thisField)();
            thisField.matrixStage_ = null;
            [thisField.mouseDownWrapper_, thisField.matrixTouchWrapper_,
                thisField.matrixReleaseWrapper_, thisField.matrixMoveWrapper_,
                thisField.clearButtonWrapper_, thisField.fillButtonWrapper_
            ].forEach(w => {
                if (w) SB.unbindEvent_(w);
            });
        };
    };

    SB.FieldLed8x8 = FieldLed8x8;
    SB.Field.register('field_led8x8', FieldLed8x8);

    // The shadow block that carries the field — plugged into any command
    // block whose argument is type 'led8x8' (see ArgumentTypeMap). This is
    // the exact parallel of scratch-blocks' `matrix` shadow for micro:bit.
    SB.defineBlocksWithJsonArray([{
        type: 'led8x8',
        message0: '%1',
        args0: [{type: 'field_led8x8', name: 'MATRIX'}],
        output: 'String',
        colour: DEVICES_COLOUR,
        colourSecondary: DEVICES_COLOUR_SECONDARY,
        colourTertiary: DEVICES_COLOUR_TERTIARY,
        outputShape: SB.OUTPUT_SHAPE_SQUARE
    }]);

    registered = true;
};

export default registerFieldLed8x8;
export {registerFieldLed8x8};
