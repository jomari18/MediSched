import test from 'node:test';
import assert from 'node:assert/strict';
import {otpConfig,otpToken,saveVerification,readVerification,cooldownRemaining,clearVerificationContext,OTP_STORAGE_KEY} from '../otp.js';
test('OTP length matches configuration; leading zeros and pasted whitespace are preserved',()=>{
  assert.equal(otpToken(' 001234 ',6),'001234');assert.equal(otpToken('00123456',8),'00123456');
  for(const value of ['12345','1234567','1e1234','12 345','abcdef'])assert.throws(()=>otpToken(value,6));
  assert.equal(otpConfig({auth:{otpLength:8}}).otpLength,8);assert.throws(()=>otpConfig({auth:{otpLength:5}}));
});
test('persistent cooldown survives reload; storage never contains password or OTP',()=>{
  const map=new Map(),storage={getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)};
  saveVerification(storage,{email:'a@example.test',nextResendAt:60000,password:'secret',token:'001234'});
  assert.deepEqual(readVerification(storage),{email:'a@example.test',nextResendAt:60000});
  assert.equal(cooldownRemaining(readVerification(storage),1),60);assert.equal(cooldownRemaining(readVerification(storage),60000),0);
  assert.doesNotMatch(storage.getItem(OTP_STORAGE_KEY),/secret|001234|password|token/);
  map.set(OTP_STORAGE_KEY,'invalid');assert.equal(readVerification(storage).nextResendAt,0);
});
test('verified sign-in clears pending email while keeping the resend cooldown',()=>{
  const map=new Map(),storage={getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)};
  saveVerification(storage,{email:'earlier@example.test',nextResendAt:60000});
  const result=clearVerificationContext(storage);
  assert.deepEqual(result,{email:'',nextResendAt:60000});
  assert.deepEqual(readVerification(storage),result);
  assert.equal(cooldownRemaining(result,1000),59);
  assert.doesNotMatch(storage.getItem(OTP_STORAGE_KEY),/earlier@example/);
});
