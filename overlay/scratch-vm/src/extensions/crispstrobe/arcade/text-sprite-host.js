// Host the retained MIT TextSprite class on real native sprites and PXT image fonts.
// The class's update/setter algorithms remain in text-sprite-pxt.js.
module.exports = function createTextSpriteHost(ext, imageEngine, initializeOriginal) {
    const text = ext._pxtText();
    class TextImage {
        constructor(raw) { this.raw = raw; }
        get width() { return this.raw.width; }
        get height() { return this.raw.height; }
        getPixel(x, y) { return imageEngine.getPixel(this.raw, x, y); }
        setPixel(x, y, color) { imageEngine.draw(this.raw, 'setPixel', x, y, color); }
        fill(color) { imageEngine.mutate(this.raw, 'fill', color); }
        fillRect(x, y, width, height, color) {
            imageEngine.draw(this.raw, 'fillRect', x, y, width, height, color);
        }
        drawIcon(icon, x, y, color) {
            text.drawIcon({_width: this.width, _height: this.height, data: this.raw.pixels,
                makeWritable() {}, color: c => Number(c) & 15}, {data: icon}, x, y, color);
        }
        print(value, x, y, color, font) {
            text.helpers.imagePrint(this, value, x, y, color, font);
        }
    }
    class NativeSprite {
        constructor(image) {
            if (!image) throw new Error('Sprite image cannot be undefined or null');
            const {width, height} = image;
            const id = ext._createSprite({KIND: '-1', TEMPLATE: '', WIDTH: width, HEIGHT: height,
                X: ((160 - width) >> 1) + width / 2, Y: ((120 - height) >> 1) + height / 2});
            Object.defineProperty(this, '__bwId', {value: id});
            const sprite = ext._spriteValues.get(id);
            // Sprite starts at the original image's left/top. In particular,
            // TextSprite starts with a zero-sized image, before its first update.
            sprite._fx = ((160 - width) >> 1) * 256;
            sprite._fy = ((120 - height) >> 1) * 256;
            ext._assignSpriteRaster(sprite, image.raw);
            ext._extensionSprites.set(id, this);
        }
        setKind(kind) { ext.setSpriteKind({ID: this.__bwId, KIND: kind}); }
        setFlag(flag, on) {
            if (flag !== 7168) throw new Error('Unknown TextSprite host flag');
            ext.setSpriteFlag({ID: this.__bwId, FLAG: 'Ghost', ON: on});
        }
        setImage(image) {
            if (image?.raw) ext._assignSpriteRaster(ext._spriteValues.get(this.__bwId), image.raw);
        }
        get image() { return new TextImage(ext._spriteValues.get(this.__bwId).image); }
    }
    const image = {...text.image, create(width, height) {
        width = Math.max(0, width | 0); height = Math.max(0, height | 0);
        return new TextImage({width, height, pixels: new Uint8Array(width * height)});
    }};
    const module = initializeOriginal({Sprite: NativeSprite, SpriteFlag: {Ghost: 7168}, image,
        createKind: () => 'Text', game: {currentScene: () => ({physicsEngine: {
            addSprite(sprite) {
                // _createSprite already inserts the same native object exactly once.
                const value = ext._spriteValues.get(sprite.__bwId);
                if (!ext._state().physicsEngine.members.includes(value)) {
                    ext._state().physicsEngine.members.push(value);
                }
            }
        }})}});
    return {...module, wrapImage: raw => raw == null ? null : new TextImage(raw)};
};
