// Real LOCAL Supabase service integration. Never accepts a hosted project URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
const url=process.env.SUPABASE_TEST_URL,publicKey=process.env.SUPABASE_TEST_PUBLIC_KEY;
const secret=process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,dbUrl=process.env.SUPABASE_TEST_DB_URL;
const configured=Boolean(url&&publicKey&&secret&&dbUrl);
test('real local Supabase signup confirmation, sessions, RLS, RPCs and logout',{
  skip:!configured?'Blocked: local Supabase stack and test-only environment variables are unavailable.':false
},async()=>{
  const api=new URL(url),db=new URL(dbUrl);
  if(!['localhost','127.0.0.1'].includes(api.hostname)||api.port!=='54321'||!['localhost','127.0.0.1'].includes(db.hostname)||db.port!=='54322'||db.pathname!=='/postgres')throw Error('Only the dedicated local Supabase stack is allowed.');
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const admin=createClient(url,secret,options),anonymous=createClient(url,publicKey,options);
  const a=createClient(url,publicKey,options),b=createClient(url,publicKey,options),u=createClient(url,publicKey,options);
  const database=new pg.Client({connectionString:dbUrl});await database.connect();
  const userIds=[],tag=Date.now(),password='LocalSupabase123!',email=`signup-${tag}@example.test`;
  try{
    // Auth signup creates the profile in the same transaction with no session.
    const signup=await u.auth.signUp({email,password,options:{data:{full_name:'Local signup check'}}});
    assert.equal(signup.error,null);assert.equal(signup.data.session,null);assert.ok(signup.data.user.id);userIds.push(signup.data.user.id);
    const profile=await database.query('select full_name from public.profiles where id=$1',[signup.data.user.id]);assert.equal(profile.rows[0].full_name,'Local signup check');
    assert.equal((await u.auth.signInWithPassword({email,password})).error.code,'email_not_confirmed');
    const resent=await u.auth.resend({type:'signup',email});
    // An immediate resend normally hits the configured 60-second server limit.
    if(resent.error)assert.ok(['over_email_send_rate_limit','over_request_rate_limit'].includes(resent.error.code));
    // Local-only admin-generated signup code exercises GoTrue verification without real delivery.
    const link=await admin.auth.admin.generateLink({type:'signup',email,password});assert.equal(link.error,null);
    const verified=await u.auth.verifyOtp({email,token:link.data.properties.email_otp,type:'email'});assert.equal(verified.error,null);assert.ok(verified.data.session);
    assert.ok((await u.auth.verifyOtp({email,token:link.data.properties.email_otp,type:'email'})).error);
    assert.equal((await u.auth.signInWithPassword({email,password})).error,null);
    assert.ok((await u.auth.getUser()).data.user.email_confirmed_at);
    assert.equal((await u.auth.signOut()).error,null);assert.equal((await u.auth.getSession()).data.session,null);
    for(const [client,prefix] of [[a,'a'],[b,'b']]){
      const created=await admin.auth.admin.createUser({email:`${prefix}-${tag}@example.test`,password,email_confirm:true,user_metadata:{full_name:'Local RPC patient'}});assert.equal(created.error,null);userIds.push(created.data.user.id);
      assert.equal((await client.auth.signInWithPassword({email:created.data.user.email,password})).error,null);
    }
    await database.query('update public.booking_configuration set enabled=true,migration_approved=true');
    const available=await a.rpc('list_available_slots',{p_doctor_id:'dr-smith',p_date:'2090-10-08'});
    assert.equal(available.error,null);assert.equal(available.data.length,26);
    assert.deepEqual(Object.keys(available.data[0]),['start_at']);
    assert.ok((await anonymous.rpc('list_available_slots',{p_doctor_id:'dr-smith',p_date:'2090-10-08'})).error);
    const request=(start='2090-10-08T09:45:00+08:00')=>({p_request_id:randomUUID(),p_doctor_id:'dr-smith',p_type_id:'general-check-up',p_patient_name:'Local patient',p_patient_address:'Manila',p_patient_age:25,p_start_at:start});
    assert.ok((await anonymous.rpc('book_appointment',request())).error);
    const attempts=await Promise.all([a.rpc('book_appointment',request()),b.rpc('book_appointment',request())]);assert.equal(attempts.filter(r=>!r.error).length,1);
    const winner=attempts.findIndex(r=>!r.error),owner=[a,b][winner],other=[a,b][1-winner];const value=attempts[winner].data;const saved=Array.isArray(value)?value[0]:value;
    assert.equal((await other.from('appointments').select('*').eq('id',saved.id)).data.length,0);
    assert.ok((await owner.from('appointments').delete().eq('id',saved.id)).error);
    assert.ok((await owner.from('appointments').update({status:'cancelled'}).eq('id',saved.id)).error);
    assert.ok((await other.rpc('cancel_appointment',{p_appointment_id:saved.id})).error);
    assert.equal((await other.rpc('book_appointment',request('2090-10-08T10:00:00+08:00'))).error.code,'23P01');
    assert.equal((await owner.rpc('book_appointment',request('2090-10-08T10:45:00+08:00'))).error,null);
    assert.ok((await owner.rpc('book_appointment',request('2000-01-01T09:45:00+08:00'))).error);
    assert.equal((await owner.rpc('cancel_appointment',{p_appointment_id:saved.id})).error,null);
    assert.equal((await owner.from('appointments').select('status').eq('id',saved.id).single()).data.status,'cancelled');
    const afterCancel=await other.rpc('list_available_slots',{p_doctor_id:'dr-smith',p_date:'2090-10-08'});
    assert.equal(afterCancel.error,null);assert.ok(afterCancel.data.some(row=>Date.parse(row.start_at)===Date.parse(saved.start_at)));
    assert.equal((await other.rpc('book_appointment',request())).error,null);
    const retryInput=request('2090-10-11T09:45:00+08:00');const first=await owner.rpc('book_appointment',retryInput),retry=await owner.rpc('book_appointment',retryInput);assert.equal(first.error,null);assert.deepEqual(first.data,retry.data);
    assert.ok((await owner.rpc('book_appointment',{...retryInput,p_patient_name:'Changed'})).error);
    for(const time of ['11:15','12:00','12:45','16:15','23:45'])assert.equal((await owner.rpc('book_appointment',request(`2090-10-09T${time}:00+08:00`))).error.code,'22023');
    const released=await other.rpc('list_available_slots',{p_doctor_id:'dr-smith',p_date:'2090-10-08'});
    assert.equal(released.error,null);assert.ok(!released.data.some(row=>Date.parse(row.start_at)===Date.parse(saved.start_at)));
  }finally{
    // Clean up only synthetic users created by this test, never whole databases.
    await database.query('delete from public.appointments where owner_uid=any($1::uuid[])',[userIds]);
    for(const id of userIds)await admin.auth.admin.deleteUser(id);
    await database.query('update public.booking_configuration set enabled=false,migration_approved=false');
    await database.end();await a.auth.signOut();await b.auth.signOut();
  }
});
