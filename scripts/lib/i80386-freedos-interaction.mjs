// Owned guest probe; assembled from test/fixtures/i80386-freedos-interaction/mouse.asm.
// The input HDD is the already-qualified owned type-1 FAT16 fixture, not FreeDOS media.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const baseHddSha256 = '2fa9c252f22cec4f8c5bdc82d1587293ffcaed791e0982384628d19a7316a851';
export const mouseCom = Buffer.from('0e1fe87200b0a8e664e86b00b0d4e664e86400b0f4e660e864003cfa75f9ba9801b409cd21bbbf01b90300e85000880743e2f8baa401b409cd21bebf01b90300ac50c0e804e8410058240fe83b00b220b402cd21e2eabab201b409cd21e81700b0d4e664e81000b0f5e660e810003cfa75f9b8004ccd21e464a80275fac3e46424213c2175f8e460c33c0a72020407043088c2b402cd21c30d0a505332205245414459240d0a505332205041434b455420240d0a50533220444f4e450d0a24000000','hex');
export function interactionHdd(input) {
    assert.equal(sha256(input),baseHddSha256,'qualified owned base HDD');
    const out=Buffer.from(input), partition=17*512;
    assert.equal(out.readUInt16LE(partition+11),512);
    assert.equal(out[partition+13],2);
    const fats=[partition+512,partition+42*512], root=partition+83*512;
    assert.equal(out[root+32],0,'new root slot is empty');
    for(const fat of fats) {assert.equal(out.readUInt16LE(fat+6),0,'cluster 3 is free');out.writeUInt16LE(0xffff,fat+6);}
    out.write('MOUSE   COM',root+32,'ascii');out[root+43]=0x20;
    out.writeUInt16LE(3,root+32+26);out.writeUInt32LE(mouseCom.length,root+32+28);
    const data=partition+(83+32)*512;
    mouseCom.copy(out,data+1024); // cluster 3, cluster 2 contains CMOUNTOK.TXT.
    return out;
}
