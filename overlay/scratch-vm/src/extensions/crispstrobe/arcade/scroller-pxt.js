// Generated from microsoft/arcade-background-scroll v0.1.2 (941e0a3afee4cd4097c1f9853a9ee7299622c7e5), MIT, Copyright (c) Microsoft Corporation.
// See static/licenses/makecode-extensions.MIT.txt.
// main.ts: blob 0e8880ec8620477e4d80925590439f62b38ecc9a, sha256 ef8799055f1d91f2c7673763f16ad868ff8c73caa7b8e9eb09cb9e481334081f
// Regenerate: node scripts/generate-arcade-scroller.mjs
module.exports = function initializePxtScroller(host) {
const {game, scene} = host;
//% block=Scroller
//% color="#ff85a7"
//% icon="\uf0b2"
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
    let BackgroundLayer;
    (function (BackgroundLayer) {
        //% block="layer 0 (bottom)"
        BackgroundLayer[BackgroundLayer["Layer0"] = 0] = "Layer0";
        //% block="layer 1"
        BackgroundLayer[BackgroundLayer["Layer1"] = 1] = "Layer1";
        //% block="layer 2"
        BackgroundLayer[BackgroundLayer["Layer2"] = 2] = "Layer2";
        //% block="layer 3"
        BackgroundLayer[BackgroundLayer["Layer3"] = 3] = "Layer3";
        //% block="layer 4 (top)"
        BackgroundLayer[BackgroundLayer["Layer4"] = 4] = "Layer4";
    })(BackgroundLayer = scroller.BackgroundLayer || (scroller.BackgroundLayer = {}));
    class LayerState {
        constructor() {
            this.updateCameraPosition();
            this.layers = [new ScrollerState(BackgroundLayer.Layer0, -1000)];
            game.currentScene().eventContext.registerFrameHandler(scene.PRE_RENDER_UPDATE_PRIORITY + 1, () => {
                this.update();
            });
        }
        getLayer(layer) {
            layer |= 0;
            for (const layerState of this.layers) {
                if (layerState.layer === layer) {
                    return layerState;
                }
            }
            const newLayer = new ScrollerState(layer, -1000 + layer);
            this.layers.push(newLayer);
            return newLayer;
        }
        update() {
            for (const layer of this.layers) {
                layer.update(this.lastCameraX, this.lastCameraY);
            }
            this.updateCameraPosition();
        }
        updateCameraPosition() {
            this.lastCameraX = game.currentScene().camera.offsetX;
            this.lastCameraY = game.currentScene().camera.offsetY;
        }
        setLayerZ(layer, z) {
            const scrollState = this.getLayer(layer);
            scrollState.renderable.z = z;
        }
    }
    let stateStack;
    class ScrollerState {
        constructor(layer, z) {
            this.layer = layer;
            this.xOffset = 0;
            this.yOffset = 0;
            this.currentXSpeed = 0;
            this.currentYSpeed = 0;
            this.cameraScrolling = false;
            this.cameraScrollMode = CameraScrollMode.OnlyHorizontal;
            this.cameraXMultiplier = 1;
            this.cameraYMultiplier = 1;
            this.renderable = scene.createRenderable(z, target => this.draw(target));
        }
        update(lastCameraX, lastCameraY) {
            const bg = this.image || scene.backgroundImage();
            if (this.cameraScrolling) {
                if (this.cameraScrollMode === CameraScrollMode.OnlyHorizontal || this.cameraScrollMode === CameraScrollMode.BothDirections) {
                    this.xOffset -= (game.currentScene().camera.offsetX - lastCameraX) * this.cameraXMultiplier;
                }
                if (this.cameraScrollMode === CameraScrollMode.OnlyVertical || this.cameraScrollMode === CameraScrollMode.BothDirections) {
                    this.yOffset -= (game.currentScene().camera.offsetY - lastCameraY) * this.cameraYMultiplier;
                }
            }
            else {
                this.xOffset += this.currentXSpeed * game.currentScene().eventContext.deltaTime;
                this.yOffset += this.currentYSpeed * game.currentScene().eventContext.deltaTime;
            }
            while (this.xOffset >= bg.width)
                this.xOffset -= bg.width;
            while (this.xOffset < 0)
                this.xOffset += bg.width;
            while (this.yOffset >= bg.height)
                this.yOffset -= bg.height;
            while (this.yOffset < 0)
                this.yOffset += bg.height;
        }
        draw(target) {
            const bg = this.image || scene.backgroundImage();
            if (this.xOffset) {
                if (this.yOffset) {
                    target.drawTransparentImage(bg, (this.xOffset | 0) - bg.width, (this.yOffset | 0) - bg.height);
                    target.drawTransparentImage(bg, (this.xOffset | 0) - bg.width, (this.yOffset | 0));
                    target.drawTransparentImage(bg, (this.xOffset | 0), (this.yOffset | 0) - bg.height);
                    target.drawTransparentImage(bg, (this.xOffset | 0), (this.yOffset | 0));
                }
                else {
                    target.drawTransparentImage(bg, (this.xOffset | 0) - bg.width, 0);
                    target.drawTransparentImage(bg, (this.xOffset | 0), 0);
                }
            }
            else if (this.yOffset) {
                target.drawTransparentImage(bg, 0, (this.yOffset | 0) - bg.height);
                target.drawTransparentImage(bg, 0, (this.yOffset | 0));
            }
            else {
                target.drawTransparentImage(bg, 0, 0);
            }
        }
    }
    function state() {
        init();
        return stateStack[stateStack.length - 1];
    }
    function init() {
        if (!stateStack) {
            stateStack = [new LayerState()];
            game.addScenePushHandler(function (oldScene) {
                stateStack.push(new LayerState());
            });
            game.addScenePopHandler(function (oldScene) {
                stateStack.pop();
                if (stateStack.length === 0) {
                    stateStack.push(new LayerState());
                }
            });
        }
    }
    /**
     * Make the current background image scroll along with the camera.
     *
     *
     * @param mode Controls the directions in which the camera may scroll
     */
    //% block="scroll background with camera $mode || for $layer"
    //% blockId=scroller_scrollBackgroundWithCamera
    //% layer.shadow=scroller_backgroundLayer
    //% group="Scrolling"
    //% weight=40
    //% blockGap=8
    //% help=github:arcade-background-scroll/docs/scroll-background-with-camera
    function scrollBackgroundWithCamera(mode, layer = 0) {
        const currentState = state().getLayer(layer);
        currentState.cameraScrolling = true;
        currentState.cameraScrollMode = mode;
    }
    scroller.scrollBackgroundWithCamera = scrollBackgroundWithCamera;
    /**
     * Make the current background image scroll at the given speeds
     *
     *
     * @param vx The speed to scroll horizontally in pixels per second
     * @param vy The speed to scroll vertically in pixels per second
     */
    //% block="scroll background with vx $vx vy $vy || for $layer"
    //% blockId=scroller_scrollBackgroundWithSpeed
    //% vx.defl=-50
    //% vy.defl=-50
    //% layer.shadow=scroller_backgroundLayer
    //% group="Scrolling"
    //% weight=20
    //% blockGap=8
    //% help=github:arcade-background-scroll/docs/scroll-background-with-speed
    function scrollBackgroundWithSpeed(vx, vy, layer = 0) {
        const currentState = state().getLayer(layer);
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
     *
     * @param xMultiplier A multiplier to apply to the scrolling in the horizontal direction
     * @param yMultiplier A multiplier to apply to the scrolling in the vertical direction
     */
    //% block="set background camera scroll multipliers to x $xMultiplier y $yMultiplier || for $layer"
    //% blockId=scroller_setCameraScrollingMultipliers
    //% xMultiplier.defl=1
    //% yMultiplier.defl=1
    //% layer.shadow=scroller_backgroundLayer
    //% group="Scrolling"
    //% weight=0
    //% blockGap=8
    //% help=github:arcade-background-scroll/docs/set-camera-scrolling-multipliers
    function setCameraScrollingMultipliers(xMultiplier = 1, yMultiplier = 1, layer = 0) {
        const currentState = state().getLayer(layer);
        currentState.cameraScrolling = true;
        currentState.cameraXMultiplier = xMultiplier;
        currentState.cameraYMultiplier = yMultiplier;
    }
    scroller.setCameraScrollingMultipliers = setCameraScrollingMultipliers;
    /**
     * Manually set the scroll offset of the background
     *
     *
     * @param x The x offset of the background in pixels
     * @param y The y offset of the background in pixels
     */
    //% block="set background offset to x $x y $y || for $layer"
    //% blockId=scroller_setBackgroundScrollOffset
    //% x.defl=0
    //% y.defl=0
    //% layer.shadow=scroller_backgroundLayer
    //% group="Position"
    //% weight=40
    //% blockGap=8
    //% help=github:arcade-background-scroll/docs/set-background-offset
    function setBackgroundScrollOffset(x, y, layer = 0) {
        const currentState = state().getLayer(layer);
        currentState.xOffset = x;
        currentState.yOffset = y;
    }
    scroller.setBackgroundScrollOffset = setBackgroundScrollOffset;
    /**
     * Returns the current x offset of the scrolled background
     */
    //% block="background offset x || for $layer"
    //% blockId=scroller_getBackgroundXOffset
    //% layer.shadow=scroller_backgroundLayer
    //% group="Position"
    //% weight=20
    //% blockGap=8
    //% help=github:arcade-background-scroll/docs/background-x-offset
    function getBackgroundXOffset(layer = 0) {
        return state().getLayer(layer).xOffset;
    }
    scroller.getBackgroundXOffset = getBackgroundXOffset;
    /**
     * Returns the current y offset of the scrolled background
     */
    //% block="background offset y || for $layer"
    //% blockId=scroller_getBackgroundYOffset
    //% layer.shadow=scroller_backgroundLayer
    //% group="Position"
    //% weight=0
    //% blockGap=8
    //% help=github:arcade-background-scroll/docs/background-y-offset
    function getBackgroundYOffset(layer = 0) {
        return state().getLayer(layer).yOffset;
    }
    scroller.getBackgroundYOffset = getBackgroundYOffset;
    /**
     * Sets the image for a specific layer in the parallax stack. Layer 0 is the
     * default (and the furthest from the camera).
     */
    //% block="set image for $layer to $image"
    //% blockId=scroller_setLayerImage
    //% image.shadow=background_image_picker
    //% layer.shadow=scroller_backgroundLayer
    //% group="Parallax"
    //% weight=10
    //% blockGap=8
    //% help=github:arcade-background-scroll/docs/set-layer-image
    function setLayerImage(layer, image) {
        state().getLayer(layer).image = image;
    }
    scroller.setLayerImage = setLayerImage;
    /**
     * Sets the z-index for a layer in the parallax stack. The default
     * z-indices range from -1000 (layer 0) to -996 (layer 4)
     */
    //% block="set z-index for $layer to $z"
    //% blockId=scroller_setLayerZIndex
    //% layer.shadow=scroller_backgroundLayer
    //% z.defl=-1000
    //% group="Parallax"
    //% weight=5
    //% blockGap=8
    //% help=github:arcade-background-scroll/docs/set-layer-z-index
    function setLayerZIndex(layer, z) {
        state().setLayerZ(layer, z);
    }
    scroller.setLayerZIndex = setLayerZIndex;
    /**
     * A layer in the parallax stack
     */
    //% shim=TD_ID
    //% block="$layer"
    //% blockId=scroller_backgroundLayer
    //% group="Parallax"
    //% weight=0
    //% blockGap=8
    function _backgroundLayer(layer) {
        return layer;
    }
    scroller._backgroundLayer = _backgroundLayer;
})(scroller || (scroller = {}));

return {scroller};
};
