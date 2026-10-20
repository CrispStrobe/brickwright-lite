// Generated from riknoll/arcade-background-scroll at 43651f88b917a98ad886fdd4c1c2ad8001ce9b9c.
// MIT, Copyright (c) 2021 Richard Knoll. See legacy-scroller-source/LICENSE.
// Source SHA256 1b456d2f65078f1ccf95cd89b30bba000e31bac423c8c1cae494f800ce31ce15; regenerate: node scripts/generate-arcade-legacy-scroller.mjs
module.exports = function initializeOriginalLegacyScroller(host) {
const {game, scene} = host;
//% block=Scroller
//% color="#ff85a7"
//% icon="\uf047"
var scroller;
(function (scroller) {
    let CameraScrollMode;
    (function (CameraScrollMode) {
        //% block="only horizontally"
        CameraScrollMode[CameraScrollMode["OnlyHorizontal"] = 0] = "OnlyHorizontal";
        //% block="only vertically"
        CameraScrollMode[CameraScrollMode["OnlyVertical"] = 1] = "OnlyVertical";
        //% block="both directions"
        CameraScrollMode[CameraScrollMode["BothDirections"] = 2] = "BothDirections";
    })(CameraScrollMode = scroller.CameraScrollMode || (scroller.CameraScrollMode = {}));
    let stateStack;
    class ScrollerState {
        constructor() {
            this.xOffset = 0;
            this.yOffset = 0;
            this.currentXSpeed = 0;
            this.currentYSpeed = 0;
            this.cameraScrolling = false;
            this.cameraScrollMode = CameraScrollMode.OnlyHorizontal;
            this.cameraXMultiplier = 1;
            this.cameraYMultiplier = 1;
        }
        init() {
            let bg;
            let currentState;
            this.lastCameraX = game.currentScene().camera.offsetX;
            this.lastCameraY = game.currentScene().camera.offsetY;
            game.onUpdate(() => {
                bg = scene.backgroundImage();
                currentState = state();
                if (this.cameraScrolling) {
                    if (this.cameraScrollMode === CameraScrollMode.OnlyHorizontal || this.cameraScrollMode === CameraScrollMode.BothDirections) {
                        currentState.xOffset -= (game.currentScene().camera.offsetX - this.lastCameraX) * this.cameraXMultiplier;
                    }
                    if (this.cameraScrollMode === CameraScrollMode.OnlyVertical || this.cameraScrollMode === CameraScrollMode.BothDirections) {
                        currentState.yOffset -= (game.currentScene().camera.offsetY - this.lastCameraY) * this.cameraYMultiplier;
                    }
                }
                else {
                    currentState.xOffset += currentState.currentXSpeed * game.currentScene().eventContext.deltaTime;
                    currentState.yOffset += currentState.currentYSpeed * game.currentScene().eventContext.deltaTime;
                }
                while (currentState.xOffset >= bg.width)
                    currentState.xOffset -= bg.width;
                while (currentState.xOffset < 0)
                    currentState.xOffset += bg.width;
                while (currentState.yOffset >= bg.height)
                    currentState.yOffset -= bg.height;
                while (currentState.yOffset < 0)
                    currentState.yOffset += bg.height;
                this.lastCameraX = game.currentScene().camera.offsetX;
                this.lastCameraY = game.currentScene().camera.offsetY;
            });
            this.renderable = scene.createRenderable(-1000, function (target, camera) {
                if (currentState.xOffset) {
                    if (currentState.yOffset) {
                        target.drawTransparentImage(bg, (currentState.xOffset | 0) - bg.width, (currentState.yOffset | 0) - bg.height);
                        target.drawTransparentImage(bg, (currentState.xOffset | 0) - bg.width, (currentState.yOffset | 0));
                        target.drawTransparentImage(bg, (currentState.xOffset | 0), (currentState.yOffset | 0) - bg.height);
                        target.drawTransparentImage(bg, (currentState.xOffset | 0), (currentState.yOffset | 0));
                    }
                    else {
                        target.drawTransparentImage(bg, (currentState.xOffset | 0) - bg.width, 0);
                        target.drawTransparentImage(bg, (currentState.xOffset | 0), 0);
                    }
                }
                else if (currentState.yOffset) {
                    target.drawTransparentImage(bg, 0, (currentState.yOffset | 0) - bg.height);
                    target.drawTransparentImage(bg, 0, (currentState.yOffset | 0));
                }
            });
        }
    }
    function state() {
        init();
        return stateStack[stateStack.length - 1];
    }
    function init() {
        if (!stateStack) {
            stateStack = [new ScrollerState()];
            game.addScenePushHandler(function (oldScene) {
                stateStack.push(new ScrollerState());
                state().init();
            });
            game.addScenePopHandler(function (oldScene) {
                stateStack.pop();
                if (stateStack.length === 0) {
                    stateStack.push(new ScrollerState());
                    state().init();
                }
            });
            state().init();
        }
    }
    /**
     * Make the current background image scroll along with the camera.
     *
     * @param mode Controls the directions in which the camera may scroll
     */
    //% block="scroll background with camera $mode"
    //% blockId=scroller_scrollBackgroundWithCamera
    //% group="Scrolling"
    //% weight=40
    //% blockGap=8
    function scrollBackgroundWithCamera(mode) {
        const currentState = state();
        currentState.cameraScrolling = true;
        currentState.cameraScrollMode = mode;
    }
    scroller.scrollBackgroundWithCamera = scrollBackgroundWithCamera;
    /**
     * Make the current background image scroll at the given speeds
     *
     * @param vx The speed to scroll horizontally in pixels per second
     * @param vy The speed to scroll vertically in pixels per second
     */
    //% block="scroll background with vx $vx vy $vy"
    //% blockId=scroller_scrollBackgroundWithSpeed
    //% vx.defl=-90
    //% vy.defl=-90
    //% group="Scrolling"
    //% weight=20
    //% blockGap=8
    function scrollBackgroundWithSpeed(vx, vy) {
        const currentState = state();
        currentState.currentXSpeed = vx;
        currentState.currentYSpeed = vy;
        currentState.cameraScrolling = false;
    }
    scroller.scrollBackgroundWithSpeed = scrollBackgroundWithSpeed;
    /**
     * Sets multipliers for the scroll directions that can be used to make scrolling
     * faster or slower in the given direction. 1 means scroll exactly with the camera
     * for both directions.
     *
     * @param xMultiplier A multiplier to apply to the scrolling in the horizontal direction
     * @param yMultiplier A multiplier to apply to the scrolling in the vertical direction
     */
    //% block="set background camera scroll multipliers to x $xMultiplier y $yMultiplier"
    //% blockId=scroller_setCameraScrollingMultipliers
    //% xMultiplier.defl=1
    //% yMultiplier.defl=1
    //% group="Scrolling"
    //% weight=0
    //% blockGap=8
    function setCameraScrollingMultipliers(xMultiplier = 1, yMultiplier = 1) {
        const currentState = state();
        currentState.cameraScrolling = true;
        currentState.cameraXMultiplier = xMultiplier;
        currentState.cameraYMultiplier = yMultiplier;
    }
    scroller.setCameraScrollingMultipliers = setCameraScrollingMultipliers;
    /**
     * Manually set the scroll offset of the background
     *
     * @param x The x offset of the background in pixels
     * @param y The y offset of the background in pixels
     */
    //% block="set background scroll offset to x $x y $y"
    //% blockId=scroller_setBackgroundScrollOffset
    //% x.defl=0
    //% y.defl=0
    //% group="Position"
    //% weight=40
    //% blockGap=8
    function setBackgroundScrollOffset(x, y) {
        const currentState = state();
        currentState.xOffset = x;
        currentState.yOffset = y;
    }
    scroller.setBackgroundScrollOffset = setBackgroundScrollOffset;
    /**
     * Returns the current x offset of the scrolled background
     */
    //% block="background scroll x"
    //% blockId=scroller_getBackgroundXOffset
    //% group="Position"
    //% weight=20
    //% blockGap=8
    function getBackgroundXOffset() {
        return state().xOffset;
    }
    scroller.getBackgroundXOffset = getBackgroundXOffset;
    /**
     * Returns the current y offset of the scrolled background
     */
    //% block="background scroll y"
    //% blockId=scroller_getBackgroundYOffset
    //% group="Position"
    //% weight=0
    //% blockGap=8
    function getBackgroundYOffset() {
        return state().yOffset;
    }
    scroller.getBackgroundYOffset = getBackgroundYOffset;
})(scroller || (scroller = {}));

return {scroller};
};
module.exports.sourceIdentity = Object.freeze({
    "packageId": "arcade-background-scroll",
    "filename": "main.ts",
    "repo": "riknoll/arcade-background-scroll",
    "revision": "43651f88b917a98ad886fdd4c1c2ad8001ce9b9c",
    "sourceSha256": "1b456d2f65078f1ccf95cd89b30bba000e31bac423c8c1cae494f800ce31ce15",
    "licence": "MIT",
    "licenceSha256": "97a7479845935a5b6bf724b315203ecaeea1f1ae2061e229765945359570f6c0"
});
