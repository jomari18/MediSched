import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,confirmationMessage} from '../supabase/functions/appointment-confirmation/handler.js';
const id='11111111-1111-4111-8111-111111111111';
const saved={id,patient_name:'<img src=x>',confirmation_email:'owner@example.test',doctor_name:'Dr. Smith',type_name:'General Check-up',start_at:'2090-10-08T01:45:00Z'};
function fixture({user={id:'owner',email_confirmed_at:'2030-01-01'},failure=false,unknown=false,finishFailure=false}={}){
  const ledger=new Map();let calls=0,payload;
  const handle=createHandler({origins:['http://localhost:5173'],sender:{name:'MediSched',email:'jomaricandido18@gmail.com'},configured:()=>true,
    authenticate:async token=>token==='valid'?user:null,
    claim:async(request,uid,attempt)=>{if(request!==id||uid!=='owner')throw Error('Unavailable');if(ledger.has(id))return {claimed:false,state:ledger.get(id).state};ledger.set(id,{state:'sending',attempt});return {claimed:true,appointment:saved};},
    finish:async(_,attempt,state)=>{if(finishFailure)throw Error('Database unavailable');assert.equal(ledger.get(id).attempt,attempt);ledger.set(id,{state,attempt});},
    send:async body=>{calls++;payload=body;if(unknown)throw Error('Network timeout');return new Response(JSON.stringify(failure?{message:'private provider diagnostic'}:{messageId:'provider-1'}),{status:failure?400:201});}
  });
  const request=(body={appointmentId:id},token='valid')=>new Request('http://local/function',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),Origin:'http://localhost:5173'},body:JSON.stringify(body)});
  return {handle,request,ledger,calls:()=>calls,payload:()=>payload};
}
test('missing/invalid/unverified authentication never sends',async()=>{
  for(const token of ['', 'invalid']){const f=fixture();assert.equal((await f.handle(f.request(undefined,token))).status,401);assert.equal(f.calls(),0);}
  const f=fixture({user:{id:'owner',user_metadata:{email_verified:true}}});assert.equal((await f.handle(f.request())).status,401);assert.equal(f.calls(),0);
});
test('other-owner and arbitrary recipient requests are rejected',async()=>{
  const f=fixture({user:{id:'other',email_confirmed_at:'2030-01-01'}});assert.equal((await f.handle(f.request())).status,403);assert.equal(f.calls(),0);
  const g=fixture();assert.equal((await g.handle(g.request({appointmentId:id,email:'attacker@example.test'}))).status,400);assert.equal(g.calls(),0);
});
test('concurrent duplicate requests and later retries produce one provider call',async()=>{
  const f=fixture();const results=await Promise.all([f.handle(f.request()),f.handle(f.request())]);assert.equal(f.calls(),1);assert.ok(results.some(r=>r.status===200));
  const retry=await f.handle(f.request());assert.equal((await retry.json()).status,'already_sent');assert.equal(f.calls(),1);
  assert.equal(f.payload().to[0].email,saved.confirmation_email);assert.equal(f.payload().sender.email,'jomaricandido18@gmail.com');assert.equal(f.payload().headers.idempotencyKey,id);
});
test('provider rejection/timeout does not allow retries to send repeatedly',async()=>{
  for(const options of [{failure:true},{unknown:true},{finishFailure:true}]){
    const f=fixture(options);assert.ok((await f.handle(f.request())).status>=500);assert.equal((await f.handle(f.request())).status,409);assert.equal(f.calls(),1);
    assert.equal(f.ledger.get(id).state,options.failure?'failed':options.finishFailure?'sending':'unknown');
  }
});
test('email template safely escapes trusted snapshots and displays Manila time',()=>{
  const message=confirmationMessage(saved,{name:'MediSched',email:'jomaricandido18@gmail.com'});
  assert.match(message.htmlContent,/&lt;img/);assert.doesNotMatch(message.htmlContent,/<img src/);assert.match(message.textContent,/9:45/);assert.match(message.textContent,/Asia\/Manila/);
});
test('CORS preflight is explicit and unexpected origins/methods are rejected',async()=>{
  const f=fixture();const result=await f.handle(new Request('http://local/function',{method:'OPTIONS',headers:{Origin:'http://localhost:5173'}}));assert.equal(result.status,204);assert.equal(result.headers.get('Access-Control-Allow-Origin'),'http://localhost:5173');
  assert.equal((await f.handle(new Request('http://local/function',{method:'POST',headers:{Origin:'https://other.example'}}))).status,403);
  assert.equal((await f.handle(new Request('http://local/function'))).status,405);assert.equal(f.calls(),0);
});
