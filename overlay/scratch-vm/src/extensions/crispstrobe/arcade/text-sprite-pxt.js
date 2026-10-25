// Generated from microsoft/arcade-text v1.3.0 at fa2439314c6633943666a763fdae32a5c67a9ae8.
// MIT, Copyright (c) Microsoft Corporation. See text-sprite-source/LICENSE.
// Source SHA256 691b89e9dc8c70c1dd3da516c409cf277591718108f8013e977f9001a86dea63; regenerate: node scripts/generate-arcade-text-sprite.mjs
module.exports = function initializeOriginalTextSprite(host) {
const {Sprite, SpriteFlag, image, game} = host;
var SpriteKind = {create: host.createKind};
var SpriteKind;
(function (SpriteKind) {
    //% isKind
    SpriteKind.Text = SpriteKind.create();
})(SpriteKind || (SpriteKind = {}));
//% blockNamespace="textsprite"
//% blockGap=8
class TextSprite extends Sprite {
    constructor(text, bg, fg, maxFontHeight, borderWidth, borderColor, padding, outlineWidth, outlineColor, icon = null) {
        super(image.create(0, 0));
        this.text = text;
        this.bg = bg;
        this.fg = fg;
        this.maxFontHeight = maxFontHeight;
        this.borderWidth = borderWidth;
        this.borderColor = borderColor;
        this.padding = padding;
        this.outlineWidth = outlineWidth;
        this.outlineColor = outlineColor;
        this.icon = icon;
        this.setKind(SpriteKind.Text);
        this.setFlag(SpriteFlag.Ghost, true);
        this.update();
    }
    update() {
        const borderAndPadding = this.borderWidth + this.padding + this.outlineWidth;
        const iconWidth = this.icon ? this.icon.width + this.padding + this.outlineWidth : 0;
        const iconHeight = this.icon ? this.icon.height : 0;
        const font = textsprite.getFontForTextAndHeight(this.text, this.maxFontHeight);
        const width = iconWidth + font.charWidth * this.text.length + 2 * borderAndPadding;
        const height = Math.max(iconHeight, font.charHeight) + 2 * borderAndPadding;
        const img = image.create(width, height);
        img.fill(this.borderColor);
        img.fillRect(this.borderWidth, this.borderWidth, width - this.borderWidth * 2, height - this.borderWidth * 2, this.bg);
        if (this.icon) {
            const iconHeightOffset = (height - iconHeight) / 2;
            textsprite.renderScaledImage(this.icon, img, borderAndPadding, iconHeightOffset);
        }
        const textHeightOffset = (height - font.charHeight) / 2;
        img.print(this.text, iconWidth + borderAndPadding, textHeightOffset, this.fg, font);
        if (this.outlineWidth > 0)
            textsprite.outlineOtherColor(img, this.fg, this.outlineWidth, this.outlineColor);
        this.setImage(img);
    }
    //% block="set $this(textSprite) max font height $height"
    //% group="Modify"
    //% weight=50
    setMaxFontHeight(height) {
        this.maxFontHeight = height;
        this.update();
    }
    //% block="set $this(textSprite) icon $icon=screen_image_picker"
    //% group="Modify"
    //% weight=46
    setIcon(icon) {
        this.icon = icon;
        this.update();
    }
    //% block="set $this(textSprite) text $text"
    //% group="Modify"
    //% weight=47
    setText(text) {
        this.text = text || "";
        this.update();
    }
    //% block="set $this(textSprite) border $width $color || and padding $padding"
    //% width.defl=1
    //% color.defl=6
    //% color.shadow="colorindexpicker"
    //% group="Modify"
    //% weight=48
    setBorder(width, color, padding = 0) {
        this.borderWidth = Math.max(width, 0);
        this.borderColor = color;
        this.padding = Math.max(padding, 0);
        this.update();
    }
    //% block="set $this(textSprite) outline $width $color"
    //% width.defl=1
    //% color.defl=6
    //% color.shadow="colorindexpicker"
    //% group="Modify"
    //% weight=49
    setOutline(width, color) {
        this.outlineWidth = Math.max(width, 0);
        this.outlineColor = color;
        this.update();
    }
}
//% color=#3e99de
//% icon="\uf031"
//% blockGap=8 block="Text Sprite"
//% groups='["Create", "Modify"]'
var textsprite;
(function (textsprite) {
    // TODO: downscale and upscale icons?
    function renderScaledImage(source, destination, x, y, downScalePowerOfTwo = 0) {
        const scale = downScalePowerOfTwo;
        const tile = source;
        for (let i = 0; i < source.width; i += 1 << scale) {
            for (let j = 0; j < source.height; j += 1 << scale) {
                if (source.getPixel(i, j) != 0) {
                    destination.setPixel(x + (i >> scale), y + (j >> scale), source.getPixel(i, j));
                }
            }
        }
    }
    textsprite.renderScaledImage = renderScaledImage;
    function getFontForTextAndHeight(text, maxHeight) {
        const baseFont = image.getFontForText(text);
        const hasUnicode = baseFont.charHeight === 12; // this is a hack
        const availableFonts = hasUnicode
            ? [baseFont]
            : [image.font8, image.font5]; // 8 and 5 are generally better fonts than 12
        const remainders = availableFonts.map(s => maxHeight % s.charHeight);
        const fontIdx = remainders.reduce((p, n, i) => remainders[p] <= n ? p : i, 99);
        const font = availableFonts[fontIdx];
        return image.scaledFont(font, maxHeight / font.charHeight);
    }
    textsprite.getFontForTextAndHeight = getFontForTextAndHeight;
    //% block="text sprite $text || as $fg on $bg"
    //% blockId="textsprite_create"
    //% blockSetVariable="textSprite"
    //% expandableArgumentMode="toggle"
    //% bg.defl=0
    //% bg.shadow="colorindexpicker"
    //% fg.defl=1
    //% fg.shadow="colorindexpicker"
    //% group="Create"
    //% weight=100
    function create(text, bg = 0, fg = 1) {
        const sprite = new TextSprite(text, bg, fg, 8, 0, 0, 0, 0, 0);
        game.currentScene().physicsEngine.addSprite(sprite);
        return sprite;
    }
    textsprite.create = create;
    function outlineOtherColor(img, targetColor, outlineWidth, outlineColor) {
        let toOutlineX = [];
        let toOutlineY = [];
        for (let x = 0; x < img.width; x++) {
            for (let y = 0; y < img.height; y++) {
                for (let sx = 0; sx <= outlineWidth; sx++) {
                    for (let sy = 0; sy <= outlineWidth; sy++) {
                        if (sx + sy === 0)
                            continue;
                        if (img.getPixel(x, y) === targetColor)
                            continue;
                        if (img.getPixel(x + sx, y + sy) === targetColor
                            || img.getPixel(x - sx, y + sy) === targetColor
                            || img.getPixel(x + sx, y - sy) === targetColor
                            || img.getPixel(x - sx, y - sy) === targetColor) {
                            toOutlineX.push(x);
                            toOutlineY.push(y);
                        }
                    }
                }
            }
        }
        for (let i = 0; i < toOutlineX.length; i++) {
            const x = toOutlineX[i];
            const y = toOutlineY[i];
            img.setPixel(x, y, outlineColor);
        }
    }
    textsprite.outlineOtherColor = outlineOtherColor;
})(textsprite || (textsprite = {}));

return {TextSprite, textsprite, SpriteKind};
};
