import test from 'node:test';
import assert from 'node:assert/strict';
import {isConfirmed,validatePublicConfig,callbackInfo,friendlyError} from '../auth-helpers.js';
test('confirmed identity needs id and server-confirmed email; metadata is insufficient',()=>{assert.equal(isConfirmed({id:'a',user_metadata:{email_verified:true}}),false);assert.equal(isConfirmed({id:'a',email_confirmed_at:'2030-01-01'}),true);assert.equal(isConfirmed({id:'a',email_confirmed_at:'2030-01-01',is_anonymous:true}),false);});
test('unconfigured client and secret/service keys fail closed',()=>{assert.throws(()=>validatePublicConfig({}));assert.throws(()=>validatePublicConfig({supabase:{url:'https://test.supabase.co',publishableKey:'sb_secret_test'}}));const service=`header.${btoa(JSON.stringify({role:'service_role'}))}.signature`;assert.throws(()=>validatePublicConfig({supabase:{url:'https://test.supabase.co',publishableKey:service}}));});
test('accepts public anon/publishable keys and only HTTPS or loopback HTTP',()=>{for(const key of ['sb_publishable_test',`header.${btoa(JSON.stringify({role:'anon'}))}.signature`])assert.equal(validatePublicConfig({supabase:{url:'http://127.0.0.1:54321',publishableKey:key}}).url,'http://127.0.0.1:54321');assert.throws(()=>validatePublicConfig({supabase:{url:'http://remote.example',publishableKey:'sb_publishable_test'}}));});
test('handles PKCE codes, implicit confirmation tokens and expired-link errors',()=>{assert.equal(callbackInfo(new URL('http://localhost/index.html?code=abc')).code,'abc');const info=callbackInfo(new URL('http://localhost/index.html#access_token=a&refresh_token=b'));assert.equal(info.accessToken,'a');assert.equal(info.refreshToken,'b');assert.equal(callbackInfo(new URL('http://localhost/index.html#error_description=Link+expired')).error,'Link expired');});
test('confirmation and conflict errors are actionable and never use server details',()=>{assert.match(friendlyError({code:'email_not_confirmed'}),/Verify/);assert.doesNotMatch(friendlyError({code:'23P01',details:'another patient'}),/another patient/);assert.match(friendlyError({name:'AuthRetryableFetchError'}),/connection/i);});
test('network failures give useful patient guidance across browser and SDK error shapes',()=>{
  for(const error of [new TypeError('Failed to fetch'),{message:'TypeError: Failed to fetch'},{name:'AuthRetryableFetchError'},{status:0},{message:'NetworkError when attempting to fetch resource.'},{message:'Load failed'},'TypeError: Failed to fetch']){
    const message=friendlyError(error);
    assert.match(message,/connection/i);assert.doesNotMatch(message,/TypeError|Supabase|project URL|local services|Failed to fetch/);
  }
  assert.equal(friendlyError({code:'invalid_credentials',message:'Failed to fetch'}),'Email or password is incorrect.');
});
test('rejects credentials embedded in the browser API URL',()=>{assert.throws(()=>validatePublicConfig({supabase:{url:'https://user:password@test.supabase.co',publishableKey:'sb_publishable_test'}}));});
