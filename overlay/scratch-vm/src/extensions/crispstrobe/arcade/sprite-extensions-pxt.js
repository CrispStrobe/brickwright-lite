// Generated from PXT Arcade 4.2.1, darts and corgio extensions (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// darts/darts.ts: 680d852cabc3f60931804b63e9a79a131326b7acdf5711f0b2aa8044b2762aac
// corgio/corgio.ts: 5aba24f6706880712dddf40e99c09c52f3deb0ddf42f7d178ea5b4b090a7c55d
// Regenerate: node scripts/generate-arcade-sprite-extensions.mjs
module.exports = function initializePxtSpriteExtensions(host) {
const {sprites, game, controller, scene, screen, img, SpriteFlag, CollisionDirection, ControllerButtonEvent} = host;
const Math = Object.create(globalThis.Math);
Math.clamp = (low, high, value) => Math.min(high, Math.max(low, value));
Math.pickRandom = host.pickRandom;
/**
* A dart with path prediction
*/
//% weight=100 color=#6699CC icon="\uf140"
//% groups='["Create", "Actions", "Properties"]'
var darts;
(function (darts) {
    /**
     * Creates a new dart from an image and kind
     * @param img the image for the sprite
     * @param kind the kind to make the dart
     * @param x optional initial x position, eg: 10
     * @param y optional initial y position, eg: 110
     */
    //% blockId=dartsCreate block="dart %img=screen_image_picker of kind %kind=spritekind || at x %x y %y"
    //% expandableArgumentMode=toggle
    //% inlineInputMode=inline
    //% blockSetVariable=myDart
    //% weight=100
    //% group="Create"
    //% help=darts/create
    function create(img, kind, x = 10, y = 110) {
        return new Dart(img, kind, x, y);
    }
    darts.create = create;
    /**
     * Convert degrees to radians
     * @param degree to convert
     * @return converted value in radians
     */
    function degreeToRadian(degree) {
        return degree * Math.PI / 180;
    }
    darts.degreeToRadian = degreeToRadian;
    /**
     * Evaluate the x component of a given vector
     * @param degree angle of vector
     * @param magnitude magnitude of vector
     * @return x component of vector
     */
    function xComponent(degree, magnitude) {
        return magnitude * Math.cos(degreeToRadian(degree));
    }
    darts.xComponent = xComponent;
    /**
     * Evaluate the y component of a given vector
     * @param degree angle of vector
     * @param magnitude magnitude of vector
     * @return y component of vector
     */
    function yComponent(degree, magnitude) {
        return -magnitude * Math.sin(degreeToRadian(degree));
    }
    darts.yComponent = yComponent;
})(darts || (darts = {}));
/**
 * A dart
 **/
//% blockNamespace=darts color="#6699CC" blockGap=8
class Dart extends sprites.ExtendableSprite {
    constructor(img, kind, x, y) {
        super(img, kind);
        this.x = x;
        this.y = y;
        this.gravity = 20;
        this.pow = 50;
        this.angle = 10;
        this.angleRate = 1;
        this.powerRate = 1;
        this.iter = 3;
        this.wind = 0;
        this.renderable = scene.createRenderable(-0.5, (target, camera) => {
            let xComp = darts.xComponent(this.angle, this.pow);
            let yComp = darts.yComponent(this.angle, this.pow);
            let xOffset = camera.offsetX;
            let yOffset = camera.offsetY;
            for (let i = 0.1; i < this.iter; i += i / 5) {
                let x = this.x + i * xComp + (i ** 2) * this.wind / 2;
                let y = this.y + i * yComp + (i ** 2) * this.gravity / 2;
                target.setPixel(x - xOffset, y - yOffset, this.traceColor);
            }
        }, () => !this.ay && this.trace);
        this.controlKeys = false;
        this.trace = false;
        this.traceColor = 1;
    }
    /**
     * NO LONGER NECESSARY -- the dart is now a sprite by itself.
     * Gets the dart's sprite.
     */
    //% group="Properties"
    //% blockId=dartSprite block="%dart(myDart) sprite"
    //% weight=8
    //% deprecated=true
    get sprite() {
        return this;
    }
    /**
     * Set whether to show the trace for the estimated path
     * @param on whether to turn on or off this feature, eg: true
     */
    //% blockId=setTrace block="trace %dart(myDart) path estimate || %on=toggleOnOff"
    //% weight=50
    //% group="Actions"
    //% help=darts/set-trace
    setTrace(on = true) {
        this.trace = on;
    }
    /**
     * Throw the dart with the current settings
     */
    //% blockId=throwDart block="throw %dart(myDart)"
    //% weight=50
    //% group="Actions"
    //% help=darts/throw-dart
    throwDart() {
        this.vx = darts.xComponent(this.angle, this.pow);
        this.vy = darts.yComponent(this.angle, this.pow);
        this.ay = this.gravity;
        this.ax = this.wind;
    }
    /**
     * Stop the dart at the current location
     */
    //% blockId=stopDart block="stop %dart(myDart)"
    //% weight=50
    //% group="Actions"
    //% help=darts/stop-dart
    stopDart() {
        this.ay = 0;
        this.ax = 0;
        this.vx = 0;
        this.vy = 0;
    }
    /**
     * Set whether to control the dart with the arrow keys; left and right
     * to adjust the angle, and up and down to increase / decrease power
     * @param on whether to turn on or off this feature, eg: true
     */
    //% blockId=controlKeys block="control %dart(myDart) with arrow keys || %on=toggleOnOff"
    //% weight=50
    //% group="Actions"
    //% help=darts/control-with-arrow-keys
    controlWithArrowKeys(on = true) {
        this.controlKeys = on;
        game.onUpdate(() => {
            if (this.controlKeys) {
                this.angle -= controller.dx() * this.angleRate / 5;
                this.pow -= controller.dy() * this.powerRate / 5;
            }
        });
    }
    destroy(effect, duration) {
        super.destroy(effect, duration);
        this.renderable.destroy();
    }
    /**
     * NO LONGER NECESSARY as this uses renderables now to draw onto the background.
     */
    //% blockId=updateBackground block="change %dart(myDart) background to image %img=background_image_picker"
    //% weight=15
    //% group="Properties"
    //% deprecated=true
    updateBackground(img) {
        scene.setBackgroundImage(img);
    }
}

/**
* Sprite Wrapper for a Corgi Platformer
*/
//% weight=100 color=#d2b48c icon="\uf1b0"
//% groups='["Create", "Movement", "Speak", "Properties"]'
var corgio;
(function (corgio) {
    let CorgiFlags;
    (function (CorgiFlags) {
        CorgiFlags[CorgiFlags["None"] = 0] = "None";
        CorgiFlags[CorgiFlags["HorizontalMovement"] = 1] = "HorizontalMovement";
        CorgiFlags[CorgiFlags["VerticalMovement"] = 2] = "VerticalMovement";
        CorgiFlags[CorgiFlags["UpdateSprite"] = 4] = "UpdateSprite";
        CorgiFlags[CorgiFlags["CameraFollow"] = 8] = "CameraFollow";
        CorgiFlags[CorgiFlags["All"] = 15] = "All";
    })(CorgiFlags = corgio.CorgiFlags || (corgio.CorgiFlags = {}));
    corgio._corgi_still = [
        img `
            . . 4 . . . 4 . .
            . 4 f 4 d 4 f 4 .
            . 4 f 4 4 4 f 4 .
            . e 4 d 4 d 4 4 .
            . 4 4 f 4 f 4 f .
            d e 4 4 4 4 4 e d
            d d 4 e d e 4 d d
        `,
        img `
            . . 4 . . . 4 . .
            . 4 f 4 d 4 f 4 .
            . 4 f 4 4 4 f 4 .
            . e 4 d 4 d 4 4 .
            . 4 4 f e f 4 f .
            . e 4 4 4 4 4 e .
            d e d 4 e 4 d e d
            d d d e d e d d d
        `,
        img `
            . . 4 . . . 4 . .
            . 4 f 4 d 4 f 4 .
            . 4 f 4 4 4 f 4 .
            . e 4 d 4 d 4 4 .
            . 4 4 f 4 f 4 f .
            . e 4 4 4 4 4 e .
            d e d 4 a 4 d e d
            d d d e d e d d d
        `,
        img `
            . . 4 . . . 4 . .
            . 4 f 4 d 4 f 4 .
            . 4 f 4 4 4 f 4 .
            . e 4 d 4 d 4 4 .
            . 4 4 f 4 f 4 f .
            . e 4 4 4 4 4 e .
            d e d 4 a 4 d e d
            d d d e a e d d d
        `,
        img `
            . . 4 . . . 4 . .
            . 4 f 4 d 4 f 4 .
            . 4 f 4 4 4 f 4 .
            . e 4 d 4 d 4 4 .
            . 4 4 f 4 f 4 f .
            . e 4 4 4 4 4 e .
            d e d 4 a 4 d e d
            d d d e d e d d d
        `,
        img `
            . . 4 . . . 4 . .
            . 4 f 4 d 4 f 4 .
            . 4 f 4 4 4 f 4 .
            . e 4 d 4 d 4 4 .
            . 4 4 f 4 f 4 f .
            . e 4 4 4 4 4 e .
            d e d 4 4 4 d e d
            d d d e d e d d d
        `,
    ];
    corgio._corgi_left = [
        img `
            . . . . . . . . . . . . . . . .
            . . 4 . . . 4 . . . . . . . . .
            . 4 f 4 d 4 f 4 . . . . . . . .
            . 4 f 4 4 4 f 4 . . . . . . . .
            . 4 4 d 4 d 4 4 . . . . . . . .
            . e 4 f 4 f 4 e . . . . e 4 f .
            . e 4 4 4 4 4 4 d . . . e 4 f .
            f d 4 4 4 4 4 d d e e e 4 4 4 .
            . 4 d d d 4 f d 4 4 4 4 4 4 . .
            . . 4 d d f f d d 4 4 4 4 4 4 .
            . . . . . d d d 4 4 f 4 f 4 4 .
            . . . . . . d 4 d 4 f f f 4 d d
            . . . . . . f . . . . . . . d f
        `,
        img `
            . . . . . . . . . . . . . . . .
            . . 4 . . . 4 . . . . . . . . .
            . 4 f 4 d 4 f 4 . . . . . . . .
            . 4 f 4 4 4 f 4 . . . . . . . .
            . 4 4 d 4 d 4 4 . . . . e 4 f .
            . e 4 f 4 f 4 e . . . . e 4 f .
            . e 4 4 4 4 4 4 d e e e 4 4 4 .
            f d 4 4 4 4 4 d d 4 4 4 4 4 . .
            . 4 d d d 4 f d 4 4 4 4 4 4 4 .
            . . 4 d d f f d d 4 f 4 f 4 4 .
            . . . . . d d d 4 d f f f 4 d d
            . . . . . . d 4 d . . . . . d f
            . . . . . . f . . . . . . . . .
        `,
        img `
            . . 4 . . . 4 . . . . . . . . .
            . 4 f 4 d 4 f 4 . . . . . . . .
            . 4 f 4 4 4 f 4 . . . . . . . .
            . 4 4 d 4 d 4 4 . . . . e 4 f .
            . e 4 f 4 f 4 e . . . . e 4 f .
            . e 4 4 4 4 4 4 d e e e 4 4 4 .
            f d 4 4 4 4 4 d d 4 4 4 4 4 . .
            . 4 d d d 4 f d 4 4 4 4 4 4 4 .
            . . 4 d d f f d d 4 f 4 f 4 4 .
            . . . . d d d 4 4 d f f f 4 d d
            . . . f d 4 . . . . . . . . d f
            . . . . f . . . . . . . . . . .
        `,
        img `
            . . 4 . . . 4 . . . . . . . . .
            . 4 f 4 d 4 f 4 . . . . . . . .
            . 4 f 4 4 4 f 4 . . . . . . . .
            . 4 4 d 4 d 4 4 . . . . e 4 f .
            . e 4 f 4 f 4 e . . . . e 4 f .
            . e 4 4 4 4 4 4 d e e e 4 4 4 .
            f d 4 4 4 4 4 d d 4 4 4 4 4 . .
            . 4 d d d 4 f d 4 4 4 4 4 4 . .
            . . 4 d d f f d d 4 f 4 f 4 . .
            . . . . d d d 4 4 d f f f 4 d .
            . . . f d 4 . . . . . . 4 d d .
            . . . . . . . . . . . . . f . .
        `,
        img `
            . . 4 . . . 4 . . . . . . . . .
            . 4 f 4 d 4 f 4 . . . . . . . .
            . 4 f 4 4 4 f 4 . . . . . . . .
            . 4 4 d 4 d 4 4 . . . . e 4 f .
            . e 4 f 4 f 4 e . . . . e 4 f .
            . e 4 4 4 4 4 4 d e e e 4 4 4 .
            f d 4 4 4 4 4 d d 4 4 4 4 4 . .
            . 4 d d d 4 f d 4 4 4 4 4 4 . .
            . . 4 d d f f d d 4 f 4 f 4 . .
            . . . . d 4 d 4 4 d f f f 4 d .
            . . . . d 4 . . . . . . 4 d d .
            . . . . . f . . . . . . . f . .
        `
    ];
    corgio._corgi_right = reflect(corgio._corgi_left);
    /**
     * Creates a new corgi from an image and kind
     * @param kind the kind to make the corgi
     * @param x optional initial x position, eg: 10
     * @param y optional initial y position, eg: 70
     */
    //% blockId=corgiCreate block="corgi of kind %kind=spritekind || at x %x y %y"
    //% expandableArgumentMode=toggle
    //% inlineInputMode=inline
    //% blockSetVariable=myCorg
    //% weight=100
    //% group="Create"
    //% help=corgio/create
    function create(kind, x = 10, y = 70) {
        return new Corgio(kind, x, y);
    }
    corgio.create = create;
    // Round input towards 0; 1.4 becomes 1.0, -0.4 becomes 0.0
    function roundTowardsZero(input) {
        return Math.floor(input) + input < 0 ? 1 : 0;
    }
    corgio.roundTowardsZero = roundTowardsZero;
    // Normalize input number to 0, 1, or -1
    function normalize(input) {
        return input ? input / Math.abs(input) : 0;
    }
    corgio.normalize = normalize;
    // Set the animation for looking right to be the opposite of looking left
    function reflect(input) {
        let output = [];
        for (let i = 0; i < input.length; i++) {
            let nextImage = input[i].clone();
            nextImage.flipX();
            output.push(nextImage);
        }
        return output;
    }
    corgio.reflect = reflect;
})(corgio || (corgio = {}));
/**
 * A Corgi Platformer
 **/
//% blockNamespace=corgio color="#d2b48c" blockGap=8
class Corgio extends sprites.ExtendableSprite {
    constructor(kind, x, y) {
        super(corgio._corgi_still[0], kind);
        this.maxMoveVelocity = 70;
        this.gravity = 300;
        this.jumpVelocity = 125;
        this.initJump = true;
        this.releasedJump = true;
        this.maxJump = 2;
        this.count = 0;
        this.touching = 2;
        this.remainingJump = this.maxJump;
        this.script = [
            "bark"
        ];
        this.controlFlags = corgio.CorgiFlags.None;
        this.stillAnimation = corgio._corgi_still;
        this._leftAnimation = corgio._corgi_left;
        this._rightAnimation = corgio._corgi_right;
        this.setFlag(SpriteFlag.StayInScreen, true);
        this.ay = this.gravity;
        this.x = x;
        this.y = y;
    }
    /**
     * Get the Corgio's sprite
     */
    //% group="Properties"
    //% blockId=corgSprite block="%corgio(myCorg) sprite"
    //% weight=8
    //% deprecated=true
    get sprite() {
        return this;
    }
    /**
     * Make the character move in the direction indicated by the left and right arrow keys.
     */
    //% group="Movement"
    //% blockId=horizontalMovement block="make %corgio(myCorg) move left and right with arrow keys || %on=toggleOnOff"
    //% weight=100 blockGap=5
    //% help=corgio/horizontal-movement
    horizontalMovement(on = true) {
        this.updateFlags(on, corgio.CorgiFlags.HorizontalMovement);
        game.onUpdate(() => {
            if (!(this.controlFlags & corgio.CorgiFlags.HorizontalMovement))
                return;
            let dir = controller.dx();
            this.vx = dir ? corgio.normalize(dir) * this.maxMoveVelocity :
                corgio.roundTowardsZero(this.vx * this.decelerationRate);
        });
    }
    /**
     * Make the character jump when the up arrow key is pressed, and grab onto the wall when falling.
     */
    //% group="Movement"
    //% blockId=verticalMovement block="make %corgio(myCorg) jump if up arrow key is pressed || %on=toggleOnOff"
    //% weight=100 blockGap=5
    //% help=corgio/vertical-movement
    verticalMovement(on = true) {
        this.updateFlags(on, corgio.CorgiFlags.VerticalMovement);
        controller.up.onEvent(ControllerButtonEvent.Released, () => {
            this.releasedJump = true;
        });
        game.onUpdate(() => {
            if (!(this.controlFlags & corgio.CorgiFlags.VerticalMovement))
                return;
            if (controller.up.isPressed()) {
                if (this.contactLeft() && controller.right.isPressed()
                    || this.contactRight() && controller.left.isPressed()) {
                    this.remainingJump = Math.max(this.remainingJump + 1, this.maxJump);
                }
                this.jumpImpulse();
            }
            if ((this.contactLeft() && controller.left.isPressed()
                || this.contactRight() && controller.right.isPressed())
                && this.vy > -10) {
                this.ay = this.gravity >> 2;
            }
            else {
                this.ay = this.gravity;
            }
            if (this.contactBelow()) {
                if (this.initJump) {
                    this.remainingJump = this.maxJump;
                }
                this.initJump = true;
            }
        });
    }
    /**
     * Set camera to follow corgio horizontally, while keeping the screen centered vertically.
     */
    //% group="Movement"
    //% blockId=followCorgi block="make camera follow %corgio(myCorg) left and right || %on=toggleOnOff"
    //% weight=90 blockGap=5
    //% help=corgio/camera-follow
    cameraFollow(on = true) {
        this.updateFlags(on, corgio.CorgiFlags.CameraFollow);
        game.onUpdate(() => {
            if (this.controlFlags & corgio.CorgiFlags.CameraFollow) {
                scene.centerCameraAt(this.x, screen.height >> 1);
            }
        });
    }
    /**
     * Make the character change sprite images when moving.
     */
    //% group="Movement"
    //% blockId=updateSprite block="change image when %corgio(myCorg) is moving || %on=toggleOnOff"
    //% weight=100 blockGap=5
    //% help=corgio/update-sprite
    updateSprite(on = true) {
        this.updateFlags(on, corgio.CorgiFlags.UpdateSprite);
        game.onUpdate(() => {
            if (!(this.controlFlags & corgio.CorgiFlags.UpdateSprite))
                return;
            this.count++;
            if (this.vx == 0) {
                this.setImage(this.pickNext(this.stillAnimation, 6));
            }
            else if (this.vx < 0) {
                this.setImage(this.pickNext(this._leftAnimation));
            }
            else {
                this.setImage(this.pickNext(this._rightAnimation));
            }
        });
    }
    /**
     * Add new phrase for the character to bark
     * @param input phrase to add to script, eg: "bark"
     */
    //% group="Speak"
    //% blockId=addScript block="teach %corgio(myCorg) the word %input"
    //% weight=95 blockGap=5
    //% help=corgio/add-to-script
    addToScript(input) {
        this.script.push(input);
    }
    /**
     * Have the character say one of the phrases in the script at random
     */
    //% group="Speak"
    //% blockId=bark block="make %corgio(myCorg) bark!"
    //% weight=95 blockGap=5
    //% help=corgio/bark
    bark() {
        this.say(Math.pickRandom(this.script), 250);
    }
    jumpImpulse() {
        if (this.remainingJump > 0 && this.releasedJump) {
            this.releasedJump = false;
            if (this.initJump) {
                this.vy = -1 * this.jumpVelocity;
                this.initJump = false;
            }
            else {
                this.vy = Math.clamp((-4 * this.jumpVelocity) / 3, -30, this.vy - this.jumpVelocity);
            }
            this.remainingJump--;
        }
    }
    updateFlags(on, flag) {
        if (on)
            this.controlFlags |= flag;
        else
            this.controlFlags &= corgio.CorgiFlags.All ^ flag;
    }
    pickNext(input, state = 3) {
        return input[(this.count / state) % input.length];
    }
    contactLeft() {
        let screenEdge = game.currentScene().camera.offsetX;
        return this.left - screenEdge <= this.touching
            || this.isHittingTile(CollisionDirection.Left);
    }
    contactRight() {
        let screenEdge = screen.width + game.currentScene().camera.offsetX;
        return screenEdge - this.right <= this.touching
            || this.isHittingTile(CollisionDirection.Right);
    }
    contactBelow() {
        let screenEdge = screen.height + game.currentScene().camera.offsetY;
        return screenEdge - this.bottom <= this.touching
            || this.isHittingTile(CollisionDirection.Bottom);
    }
}

return {darts, Dart, corgio, Corgio};
};
