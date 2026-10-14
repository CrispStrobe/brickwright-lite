import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {VIEWPORT_SCALING_CASES, VIEWPORT_SCALING_PIXELS, VIEWPORT_SCALING_ORACLE_SOURCE} from './fixtures/arcade-viewport-scaling.mjs';

const Arcade = loadExtensionClass('arcade');
test('pinned original screen pixels match bounded viewport rasters at huge scales, panning, transparency and camera positions', async () => {
    const original = await runPxtArcade(VIEWPORT_SCALING_ORACLE_SOURCE);
    const arcade = new Arcade(new EventEmitter());
    const image = arcade.createImage({WIDTH: 4, HEIGHT: 4});
    VIEWPORT_SCALING_PIXELS.forEach((color, index) => arcade.setImagePixel({IMAGE: image, X: index % 4, Y: index >> 2, COLOR: color}));
    const id = arcade.createImageSprite({IMAGE: image, KIND: 'Player'});
    for (const [index, c] of VIEWPORT_SCALING_CASES.entries()) {
        arcade.setSpriteProperty({ID: id, PROPERTY: 'sx', VALUE: c.sx});
        arcade.setSpriteProperty({ID: id, PROPERTY: 'sy', VALUE: c.sy});
        const sprite = arcade._sprite(id);
        arcade.setSpritePosition({ID: id, X: c.left + sprite.width / 2, Y: c.top + sprite.height / 2});
        assert.equal(arcade.spriteProperty({ID:id,PROPERTY:'left'}),original['movedLeft'+index],c.name+' setPosition left');
        assert.equal(arcade.spriteProperty({ID:id,PROPERTY:'top'}),original['movedTop'+index],c.name+' setPosition top');
        arcade.setSpriteProperty({ID:id,PROPERTY:'left',VALUE:c.left});
        arcade.setSpriteProperty({ID:id,PROPERTY:'top',VALUE:c.top});
        assert.equal(arcade.spriteProperty({ID:id,PROPERTY:'x'}),original['centerX'+index],c.name+' x getter');
        assert.equal(arcade.spriteProperty({ID:id,PROPERTY:'y'}),original['centerY'+index],c.name+' y getter');
        arcade.setSpriteFlag({ID: id, FLAG: 'RelativeToCamera', ON: !!c.relative});
        Object.assign(arcade._camera(), {drawOffsetX: Math.floor(c.cameraX || 0), drawOffsetY: Math.floor(c.cameraY || 0)});
        for(const key of ['width','height','left','top']) assert.equal(arcade.spriteProperty({ID:id,PROPERTY:key}),original[key+index],c.name+' '+key);
        const window = arcade._spriteRasterWindow(sprite);
        const raster = arcade._scaledSpriteImage(sprite, window);
        assert.ok(raster.width <= 160 && raster.height <= 120 && raster.pixels.length <= 19200, c.name + ' allocation is bounded');
        const view = arcade._spriteViewPosition(sprite);
        const left = view.x - sprite.width / 2 + window.x;
        const top = view.y - sprite.height / 2 + window.y;
        const pixels = new Uint8Array(19200).fill(1);
        for (let y = 0; y < raster.height; y++) for (let x = 0; x < raster.width; x++) {
            const color = raster.pixels[y * raster.width + x];
            if (color) pixels[(top + y) * 160 + left + x] = color;
        }
        const native = Array.from(pixels, color => color.toString(16)).join('');
        assert.equal(native.length, original['frame' + index].length, c.name);
        for (let offset = 0; offset < native.length; offset++) {
            if (native[offset] !== original['frame' + index][offset]) {
                assert.fail(`${c.name}: pixel (${offset % 160},${offset / 160 | 0}) native=${native[offset]} original=${original['frame' + index][offset]}`);
            }
        }
    }
});
