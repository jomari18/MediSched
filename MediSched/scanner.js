let decoderPromise;
export async function makeDecoder(){
 if(globalThis.BarcodeDetector){try{if((await BarcodeDetector.getSupportedFormats()).includes('qr_code')){const detector=new BarcodeDetector({formats:['qr_code']});return async video=>(await detector.detect(video))[0]?.rawValue||null}}catch{}}
 if(!decoderPromise)decoderPromise=import('./vendor/jsQR-1.4.0.js').then(()=>globalThis.jsQR).catch(e=>{decoderPromise=null;throw e});
 const decode=await decoderPromise;if(typeof decode!=='function')throw Error('QR decoder unavailable');
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 return async video=>{if(!video.videoWidth)return null;const scale=Math.min(1,640/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);ctx.drawImage(video,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);return decode(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'})?.data||null};
}
export function createCameraScanner({video,onCode,onError,getMedia=()=>navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}),decode=makeDecoder,requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id)}){
 let epoch=0,stream=null,frame=null;
 function stop(){++epoch;if(frame!==null)cancelFrame(frame);frame=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null}
 async function start(){stop();const current=epoch;try{
  const obtained=await getMedia();if(current!==epoch){obtained.getTracks().forEach(t=>t.stop());return}stream=obtained;video.srcObject=stream;await video.play();if(current!==epoch)return;
  const read=await decode();if(current!==epoch)return;let last=0;
  async function tick(time){if(current!==epoch)return;try{if(time-last>200&&video.readyState>=2){last=time;const code=await read(video);if(current!==epoch)return;if(code){stop();onCode(code);return}}frame=requestFrame(tick)}catch(e){if(current===epoch){stop();onError(e)}}}
  frame=requestFrame(tick);
 }catch(e){if(current===epoch){stop();onError(e)}}}
 return {start,stop};
}
