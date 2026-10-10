import test from 'node:test';import assert from 'node:assert/strict';
import {createCameraScanner} from '../scanner.js';
test('late camera permission after close stops every track without attaching video',async()=>{
 let resolve,stopped=0;const video={srcObject:null,play:async()=>{throw Error('Must not play')}};
 const scanner=createCameraScanner({video,getMedia:()=>new Promise(r=>resolve=r),decode:async()=>null,onCode(){},onError(){}});
 const pending=scanner.start();scanner.stop();resolve({getTracks:()=>[{stop:()=>stopped++}]});await pending;assert.equal(stopped,1);assert.equal(video.srcObject,null);
});
test('denied camera gives manual-entry fallback and no active stream',async()=>{
 let error;const video={srcObject:null};const scanner=createCameraScanner({video,getMedia:async()=>{throw Error('Denied')},decode:async()=>null,onError:e=>error=e,onCode(){}});
 await scanner.start();assert.ok(error);assert.equal(video.srcObject,null);
});
