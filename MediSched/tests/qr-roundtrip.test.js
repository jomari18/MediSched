import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {qrcode} from '../vendor/qrcode-2.0.4.mjs';import {checkinPayload,parseCheckinPayload} from '../checkin.js';
test('local QR encoder and fallback decoder round-trip an opaque reference',async()=>{
 const context={self:{},Uint8ClampedArray,Uint8Array};vm.runInNewContext(await readFile(new URL('../vendor/jsQR-1.4.0.js',import.meta.url),'utf8'),context);
 const payload=checkinPayload('0'.repeat(63)+'f'),qr=qrcode(0,'M');qr.addData(payload,'Byte');qr.make();const count=qr.getModuleCount(),cell=6,size=(count+8)*cell,pixels=new Uint8ClampedArray(size*size*4);pixels.fill(255);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const row=Math.floor(y/cell)-4,col=Math.floor(x/cell)-4;if(row>=0&&row<count&&col>=0&&col<count&&qr.isDark(row,col)){const offset=(y*size+x)*4;pixels[offset]=pixels[offset+1]=pixels[offset+2]=0}}
 const decoded=context.self.jsQR(pixels,size,size);assert.equal(decoded.data,payload);assert.equal(parseCheckinPayload(decoded.data),'0'.repeat(63)+'f');
});
