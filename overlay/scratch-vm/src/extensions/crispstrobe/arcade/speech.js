// Pixel-image and clock bridge for PXT's speech renderers. This function is
// injected into the bundled extension along with the generated PXT classes.
module.exports = function createSpeechEngine(initialize, fonts) {
    let now = 0;
    let deltaTime = 0;
    const camera = {offsetX: 0, offsetY: 0, drawOffsetX: 0, drawOffsetY: 0};
    const decoded = {};
    for (const key of ['font8', 'font12']) {
        const font = fonts[key];
        const data = Uint8Array.from(atob(font.data), c => c.charCodeAt(0));
        const stride = 2 + font.charWidth * Math.ceil(font.charHeight / 8);
        const glyphs = new Map();
        for (let offset = 0; offset + stride <= data.length; offset += stride) {
            glyphs.set(data[offset] | data[offset + 1] << 8, data.slice(offset + 2, offset + stride));
        }
        // This factory crosses the adapter boundary through Function.toString().
        // Object spread makes Babel hoist a helper outside that serialized body.
        decoded[key] = Object.assign({}, font, {glyphs});
    }
    class PixelImage {
        constructor(width, height) {
            this.width = Math.max(1, width | 0);
            this.height = Math.max(1, height | 0);
            this.pixels = new Uint8Array(this.width * this.height);
        }
        setPixel(x, y, color) {
            x |= 0; y |= 0;
            if (x >= 0 && x < this.width && y >= 0 && y < this.height) this.pixels[y * this.width + x] = color & 15;
        }
        fill(color) { this.pixels.fill(color & 15); }
        fillRect(x, y, width, height, color) {
            x |= 0; y |= 0; width |= 0; height |= 0;
            for (let row = Math.max(0, y); row < Math.min(this.height, y + height); row++) {
                for (let col = Math.max(0, x); col < Math.min(this.width, x + width); col++) {
                    this.pixels[row * this.width + col] = color & 15;
                }
            }
        }
        print(text, x, y, color, font) {
            x |= 0; y |= 0;
            const origin = x;
            const byteHeight = Math.ceil(font.charHeight / 8);
            for (let i = 0; i < text.length; i++) {
                const code = text.charCodeAt(i);
                if (code === 10) { y += font.charHeight + 2; x = origin; }
                if (code < 32) continue;
                const glyph = font.glyphs.get(code) || font.glyphs.get(32);
                if (glyph) for (let col = 0; col < font.charWidth; col++) {
                    for (let row = 0; row < font.charHeight; row++) {
                        if (glyph[col * byteHeight + (row >> 3)] & (1 << (row & 7))) {
                            this.setPixel(x + col, y + row, color || 1);
                        }
                    }
                }
                x += font.charWidth;
            }
        }
        drawTransparentImage(source, x, y) {
            for (let row = 0; row < source.height; row++) for (let col = 0; col < source.width; col++) {
                const color = source.pixels[row * source.width + col];
                if (color) this.setPixel(x + col, y + row, color);
            }
        }
    }
    class BubbleSprite {
        constructor(image) { this.image = image; this.x = 0; this.y = 0; this.flags = 0; }
        get width() { return this.image.width; }
        get height() { return this.image.height; }
        get left() { return this.x - this.width / 2; }
        set left(value) { this.x = value + this.width / 2; }
        get right() { return this.x + this.width / 2; }
        set right(value) { this.x = value - this.width / 2; }
        get top() { return this.y - this.height / 2; }
        setImage(image) { this.image = image; }
        setFlag(flag, on) { this.flags = on ? this.flags | flag : this.flags & ~flag; }
        destroy() { this.destroyed = true; }
    }
    const image = {
        create: (width, height) => new PixelImage(width, height),
        getFontForText: text => /[\u2001-\uffff]/.test(text) ? decoded.font12 : decoded.font8
    };
    const screen = new PixelImage(160, 120);
    const game = {
        runtime: () => now,
        currentScene: () => ({camera, eventContext: {deltaTimeMillis: deltaTime * 1000}}),
        eventContext: () => ({deltaTime})
    };
    const inspect = text => typeof text === 'object' ? JSON.stringify(text) : String(text);
    const pxt = initialize(image, {millis: () => now}, game, screen,
        {Ghost: 4, RelativeToCamera: 2}, {toInt: value => value | 0}, inspect);
    pxt.Flag = {Destroyed: 1, RelativeToCamera: 2};
    pxt.create = img => new BubbleSprite(img);
    function ownerFor(sprite) {
        const owner = Object.assign({}, sprite, {flags: 0});
        owner.left = owner.x - owner.width / 2;
        owner.top = owner.y - owner.height / 2;
        owner._hitbox = {oy: 0};
        if (sprite.mask) {
            const first = sprite.mask.findIndex(pixel => pixel !== 0);
            if (first >= 0) owner._hitbox.oy = Math.floor(first / sprite.width);
        }
        owner.isOutOfScreen = () => owner.left + owner.width < 0 || owner.top + owner.height < 0 ||
            owner.left > 160 || owner.top > 120;
        return owner;
    }
    return {
        create(text, duration, animated, foreground, background, legacy, sprite, time) {
            now = time;
            const owner = ownerFor(sprite);
            const renderer = legacy ? new pxt.LegacySpriteSayRenderer(text, duration < 0 ? undefined : duration,
                owner, foreground, background) : new pxt.SpriteSayRenderer(text, foreground, background,
                animated, duration < 0 ? undefined : duration);
            renderer._bwOwner = owner;
            return renderer;
        },
        render(renderer, sprite, time, dt) {
            now = time; deltaTime = dt;
            screen.fill(0);
            const owner = renderer._bwOwner;
            Object.assign(owner, ownerFor(sprite));
            renderer.update(dt, camera, owner);
            renderer.draw(screen, camera, owner);
            const bubble = renderer.sayBubbleSprite;
            if (bubble && !bubble.destroyed) {
                screen.drawTransparentImage(bubble.image, Math.floor(bubble.left), Math.floor(bubble.top));
            }
            return screen.pixels.slice();
        }
    };
};
