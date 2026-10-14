// Owned synthetic artwork: four asymmetric corners, transparent elsewhere.
import {deflateSync} from 'node:zlib';
export const BACKGROUND_WIDTH = 160;
export const BACKGROUND_HEIGHT = 120;
export const BACKGROUND_CORNERS = [[0,0,2],[159,0,7],[0,119,5],[159,119,9]];
export const AUTHORED_CORNERS = [[0,0,10],[159,0,11],[0,119,12],[159,119,13]];
export const backgroundPixels = corners => {
    const pixels = new Uint8Array(BACKGROUND_WIDTH * BACKGROUND_HEIGHT);
    for (const [x,y,colour] of corners) pixels[y * BACKGROUND_WIDTH + x] = colour;
    return pixels;
};
const chunk = (name, data) => {
    const body = Buffer.concat([Buffer.from(name),data]);
    let crc = 0xffffffff;
    for (const byte of body) {
        crc ^= byte;
        for (let bit=0; bit<8; bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
    }
    const size=Buffer.alloc(4), checksum=Buffer.alloc(4);
    size.writeUInt32BE(data.length);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
    return Buffer.concat([size,body,checksum]);
};
export const backgroundPng = palette => {
    const pixels=backgroundPixels(BACKGROUND_CORNERS);
    const rows=Buffer.alloc((BACKGROUND_WIDTH*4+1)*BACKGROUND_HEIGHT);
    for (let y=0;y<BACKGROUND_HEIGHT;y++) for (let x=0;x<BACKGROUND_WIDTH;x++) {
        const colour=pixels[y*BACKGROUND_WIDTH+x];
        if (!colour) continue;
        const rgb=palette[colour].slice(1).match(/../g).map(value=>parseInt(value,16));
        rows.set([...rgb,255],y*(BACKGROUND_WIDTH*4+1)+1+x*4);
    }
    const header=Buffer.alloc(13);
    header.writeUInt32BE(BACKGROUND_WIDTH);header.writeUInt32BE(BACKGROUND_HEIGHT,4);header[8]=8;header[9]=6;
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),
        chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
};

export const UNMARKED_BACKGROUND_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect x="0" y="0" width="480" height="360" fill="#ff2121"/></svg>';
