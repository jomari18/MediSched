import test from 'node:test';
import assert from 'node:assert/strict';
// A synthetic Auth boundary prevents real account changes or email delivery.
const module = await import('../password-recovery.js').catch(() => ({}));
function fixture(overrides={}) {
  let session=null, sent=[], updates=[], signedOut=0, now=1000;
  const user={id:'recovery-user',email:'patient@example.test',email_confirmed_at:'2026-01-01'};
  const auth={
    async resetPasswordForEmail(email){sent.push(email);return {error:null};},
    async verifyOtp(input){if(input.type!=='recovery'||input.token!=='00123456')return {data:{},error:{code:'otp_expired'}};session={user};return {data:{user,session},error:null};},
    async getUser(){return {data:{user:session?.user},error:null};},
    async updateUser(input){updates.push(input);return {data:{user},error:null};},
    async signOut({scope}){assert.equal(scope,'local');signedOut++;session=null;return {error:null};},
    ...overrides
  };
  assert.equal(typeof module.createPasswordRecovery,'function','OTP recovery controller is available');
  const flow=module.createPasswordRecovery({auth,otpLength:8,resendCooldownSeconds:60,now:()=>now});
  return {flow,sent,updates,get signedOut(){return signedOut;},get session(){return session;},advance(ms){now+=ms;}};
}
test('password updates require a recovery OTP and end that session before completion',async()=>{
  const f=fixture();await assert.rejects(f.flow.update('NewPassword123!','NewPassword123!'),/verify/i);
  await f.flow.request(' Patient@example.test ');assert.deepEqual(f.sent,['patient@example.test']);
  await assert.rejects(f.flow.verify('99999999'),e=>e.code==='otp_expired');assert.equal(f.flow.snapshot().verified,false);
  await f.flow.verify('00123456');assert.equal(f.flow.snapshot().verified,true);
  await f.flow.update('NewPassword123!','NewPassword123!');assert.deepEqual(f.updates,[{password:'NewPassword123!'}]);
  assert.equal(f.signedOut,1);assert.equal(f.session,null);assert.equal(f.flow.snapshot().complete,true);
  await assert.rejects(f.flow.update('AgainPassword123!','AgainPassword123!'),/verify/i);
});
test('resend cooldown cannot be bypassed by changing the email',async()=>{
  const f=fixture();await f.flow.request('patient@example.test');
  assert.equal(f.flow.snapshot().remaining,60);await assert.rejects(f.flow.request('other@example.test'),/wait/i);
  assert.equal(f.sent.length,1);f.advance(60000);await f.flow.request('other@example.test');assert.equal(f.sent.length,2);
});
test('changing email invalidates proof and cleans up only the recovery session',async()=>{
  const f=fixture();await f.flow.request('patient@example.test');await f.flow.verify('00123456');
  await f.flow.setEmail('other@example.test');assert.equal(f.flow.snapshot().verified,false);assert.equal(f.session,null);
  await assert.rejects(f.flow.update('NewPassword123!','NewPassword123!'),/verify/i);assert.equal(f.updates.length,0);
});
test('short and mismatched passwords never reach Auth',async()=>{
  const f=fixture();await f.flow.request('patient@example.test');await f.flow.verify('00123456');
  await assert.rejects(f.flow.update('short','short'),/8/);await assert.rejects(f.flow.update('Password123!','Different123!'),/match/i);
  assert.deepEqual(f.updates,[]);assert.equal(f.flow.snapshot().verified,true);
});
test('malformed or another account session cannot become recovery proof',async()=>{
  for(const response of [{data:{},error:null},{data:{session:{user:{id:'other',email:'other@example.test'}}},error:null}]){
    const f=fixture({verifyOtp:async()=>response});await f.flow.request('patient@example.test');await assert.rejects(f.flow.verify('00123456'),/recovery/i);
    assert.equal(f.flow.snapshot().verified,false);assert.equal(f.updates.length,0);
  }
});
test('network failures retain cooldown and do not grant proof',async()=>{
  const f=fixture({resetPasswordForEmail:async()=>{throw Error('Failed to fetch');}});
  await assert.rejects(f.flow.request('patient@example.test'),/fetch/);assert.equal(f.flow.snapshot().remaining,60);assert.equal(f.flow.snapshot().verified,false);
});
test('weak or same-password errors allow retry without reporting success',async()=>{
  for(const code of ['weak_password','same_password']){
    const f=fixture({updateUser:async()=>({error:{code}})});await f.flow.request('patient@example.test');await f.flow.verify('00123456');
    await assert.rejects(f.flow.update('NewPassword123!','NewPassword123!'),e=>e.code===code);
    assert.equal(f.flow.snapshot().complete,false);assert.equal(f.flow.snapshot().verified,true);
  }
});
test('cleanup failure blocks success and retries cleanup without updating again',async()=>{
  let attempts=0;const f=fixture({signOut:async()=>({error:++attempts===1?Error('Cleanup unavailable'):null})});
  await f.flow.request('patient@example.test');await f.flow.verify('00123456');
  await assert.rejects(f.flow.update('NewPassword123!','NewPassword123!'),/Cleanup/);assert.equal(f.flow.snapshot().complete,false);
  await f.flow.finish();assert.equal(f.flow.snapshot().complete,true);assert.equal(f.updates.length,1);
});
test('expired server session invalidates proof before changing a password',async()=>{
  const f=fixture({getUser:async()=>({data:{user:null},error:{code:'session_not_found'}})});
  await f.flow.request('patient@example.test');await f.flow.verify('00123456');
  await assert.rejects(f.flow.update('NewPassword123!','NewPassword123!'),/expired/i);assert.equal(f.flow.snapshot().verified,false);assert.equal(f.updates.length,0);
});
