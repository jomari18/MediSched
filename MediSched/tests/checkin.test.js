import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCheckinPayload,checkinPayload,createCheckinData,passDeadline} from '../checkin.js';
test('QR is opaque exact versioned hex, preserves leading zeros and rejects foreign input',()=>{
 const token='0'.repeat(63)+'a';assert.equal(parseCheckinPayload(checkinPayload(token)),token);
 for(const input of [token,'https://example.test/'+token,'medisched:checkin:v2:'+token,'medisched:checkin:v1:'+token.toUpperCase(),'medisched:checkin:v1:'+token+'\n','<script>'])assert.equal(parseCheckinPayload(input),null);
 assert.throws(()=>checkinPayload('patient@example.test'));
 assert.throws(()=>checkinPayload(token+'\n'));
});
test('pass countdown conservatively accounts for RPC latency and rejects expired responses',()=>{const r={server_now:'2026-10-10T00:00:00Z',expires_at:'2026-10-10T00:10:00Z'};assert.equal(passDeadline(r,100,5100),600100);assert.throws(()=>passDeadline(r,100,600101));assert.throws(()=>passDeadline({server_now:'invalid',expires_at:r.expires_at},0,1))});
test('RPC requests carry only stable references, never patient parameters',async()=>{
 const calls=[];const data=createCheckinData({rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true}}}});
 await data.issue('appointment');await data.preview('a'.repeat(64));await data.consume('a'.repeat(64),'action',2);
 assert.deepEqual(calls[0],{name:'issue_appointment_checkin_pass',args:{p_appointment_id:'appointment'}});
 assert.deepEqual(calls[2].args,{p_token:'a'.repeat(64),p_action_id:'action',p_expected_version:2});
});
