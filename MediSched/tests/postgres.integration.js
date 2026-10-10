import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {createHandler} from '../supabase/functions/appointment-confirmation/handler.js';
const connectionString=process.env.MEDISCHED_TEST_DATABASE_URL||'postgresql://medisched_test@127.0.0.1:55432/medisched_test';
const target=new URL(connectionString);
if(!['127.0.0.1','localhost'].includes(target.hostname)||target.port!=='55432'||target.pathname!=='/medisched_test')throw Error('Database tests require the dedicated local medisched_test database on port 55432.');
const pool=new pg.Pool({connectionString,max:6});
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',U='33333333-3333-4333-8333-333333333333';
const base={doctor:'dr-smith',type:'general-check-up',name:' Patient ',address:' Manila ',age:25,start:'2090-10-08T09:45:00+08:00'};
async function asUser(uid,operation,role='authenticated'){
  const c=await pool.connect();try{await c.query('begin');await c.query(`set local role ${role==='anon'?'anon':'authenticated'}`);await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid,role,email_confirmed:true})]);const result=await operation(c);await c.query('commit');return result;}catch(error){await c.query('rollback');throw error;}finally{c.release();}
}
function book(c,id=randomUUID(),v=base){return c.query('select (public.book_appointment($1,$2,$3,$4,$5,$6,$7)).*',[id,v.doctor,v.type,v.name,v.address,v.age,v.start]).then(r=>r.rows[0]);}
async function rejection(operation,code){await assert.rejects(operation,error=>{assert.equal(error.code,code);return true;});}
before(async()=>{
  const existing=await pool.query("select to_regclass('public.medisched_test_fixture') as marker");
  if(!existing.rows[0].marker){
    const empty=await pool.query("select count(*)::int as count from pg_catalog.pg_tables where schemaname in ('public','auth')");if(empty.rows[0].count)throw Error('Refusing to initialize a database containing unknown tables.');
    await pool.query(await readFile('tests/postgres-bootstrap.sql','utf8'));
    for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(`supabase/migrations/${file}`,'utf8'));
  }
  const marker=await pool.query('select marker from public.medisched_test_fixture');assert.equal(marker.rows[0].marker,'isolated-postgres-auth-fixture');
  if(!(await pool.query("select to_regclass('public.appointment_notifications') as marker")).rows[0].marker)await pool.query(await readFile('supabase/migrations/202610080004_appointment_notifications.sql','utf8'));
  if(!(await pool.query("select to_regprocedure('public.list_available_slots(text,date)') as marker")).rows[0].marker)await pool.query(await readFile('supabase/migrations/202610090005_available_slots.sql','utf8'));
  if(!(await pool.query("select to_regclass('public.appointment_attendance') as marker")).rows[0].marker)await pool.query(await readFile('supabase/migrations/202610090006_staff_workflow.sql','utf8'));
  // Broad synthetic windows for the original constraint tests below. The new
  // availability tests restore and exercise the approved 8–5 / noon schedule.
  await pool.query('delete from public.clinic_hours');
  await pool.query('insert into public.clinic_hours select day,0,1440 from generate_series(1,7) day');
  await pool.query('truncate auth.users cascade');
  for(const [id,email,confirmed] of [[A,'a@example.test',true],[B,'b@example.test',true],[U,'u@example.test',false]])await pool.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)',[id,email,confirmed?new Date():null,{full_name:' Local patient '}]);
  await pool.query('update public.booking_configuration set enabled=false,migration_approved=false');
});
after(()=>pool.end());
test('profile trigger creates profile before confirmation; readiness gate defaults closed',async()=>{
  const profile=await pool.query('select * from public.profiles where id=$1',[U]);assert.equal(profile.rows[0].full_name,'Local patient');
  await rejection(asUser(A,c=>book(c)), '55000');
  await rejection(asUser(A,c=>c.query("select * from public.list_available_slots('dr-smith','2090-10-22')")), '55000');
  await pool.query('update public.booking_configuration set enabled=true,migration_approved=true');
});
test('anonymous and unverified rejection uses Auth row, not forged confirmation claims',async()=>{
  await rejection(asUser(null,c=>book(c), 'anon'),'42501');
  await rejection(asUser(U,c=>book(c)),'42501');
  assert.equal((await asUser(U,c=>c.query('select * from public.profiles'))).rowCount,0);
  await rejection(asUser(null,c=>c.query('select * from public.appointments'),'anon'),'42501');
});
test('concurrent different-user requests allow exactly one, with private conflict feedback',async()=>{
  const results=await Promise.allSettled([asUser(A,c=>book(c)),asUser(B,c=>book(c))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const failure=results.find(r=>r.status==='rejected').reason;assert.equal(failure.code,'23P01');assert.equal(failure.detail,undefined);assert.doesNotMatch(failure.message,/Patient|example\.test|owner_uid/);
});
test('owner-only RLS and forbidden direct writes, including other-user cancellation',async()=>{
  const saved=(await pool.query('select * from public.appointments limit 1')).rows[0],owner=saved.owner_uid,other=owner===A?B:A;
  assert.equal((await asUser(owner,c=>c.query('select * from public.appointments where id=$1',[saved.id]))).rowCount,1);
  assert.equal((await asUser(other,c=>c.query('select * from public.appointments where id=$1',[saved.id]))).rowCount,0);
  assert.equal((await asUser(other,c=>c.query('select * from public.profiles where id=$1',[owner]))).rowCount,0);
  assert.equal((await asUser(U,c=>c.query('select * from public.appointments'))).rowCount,0);
  assert.equal((await asUser(U,c=>c.query('select * from public.doctors'))).rowCount,0);
  await rejection(asUser(owner,c=>c.query('update public.appointments set status=$1 where id=$2',['cancelled',saved.id])),'42501');
  await rejection(asUser(owner,c=>c.query('delete from public.appointments where id=$1',[saved.id])),'42501');
  await rejection(asUser(owner,c=>c.query('insert into public.appointments(id) values($1)',[randomUUID()])),'42501');
  await rejection(asUser(owner,c=>c.query('insert into public.profiles(id,full_name) values($1,$2)',[randomUUID(),'forged'])),'42501');
  await rejection(asUser(other,c=>c.query('select public.cancel_appointment($1)',[saved.id])),'42501');
  await rejection(asUser(owner,c=>c.query('select * from public.booking_configuration')),'42501');
});
test('09:45 vs 10:00 overlap rejected; 10:45 adjacent allowed; separate doctors allowed',async()=>{
  await rejection(asUser(A,c=>book(c,randomUUID(),{...base,start:'2090-10-08T10:00:00+08:00'})),'23P01');
  assert.ok((await asUser(A,c=>book(c,randomUUID(),{...base,start:'2090-10-08T10:45:00+08:00'}))).id);
  assert.ok((await asUser(A,c=>book(c,randomUUID(),{...base,doctor:'dr-brown'}))).id);
});
test('half-open ranges handle midnight overlap and adjacent next-day bookings',async()=>{
  // Represents a record saved before clinic hours existed; production migration
  // never rewrites it. Bypass only this new trigger inside the private fixture.
  const c=await pool.connect();
  try{
    await c.query('begin');await c.query('alter table public.appointments disable trigger medisched_clinic_hours_before_booking');
    await c.query("insert into public.appointments(id,owner_uid,doctor_id,type_id,doctor_name,type_name,patient_name,patient_address,patient_age,confirmation_email,start_at,end_at) values($1,$2,'dr-smith','general-check-up','Dr. Smith','General Check-up','Patient','Manila',25,'a@example.test','2090-10-09T23:45:00+08','2090-10-10T00:45:00+08')",[randomUUID(),A]);
    await c.query('alter table public.appointments enable trigger medisched_clinic_hours_before_booking');await c.query('commit');
  }catch(error){await c.query('rollback');throw error;}finally{c.release();}
  await rejection(asUser(B,c=>book(c,randomUUID(),{...base,start:'2090-10-10T00:00:00+08:00'})),'23P01');
  await asUser(B,c=>book(c,randomUUID(),{...base,start:'2090-10-10T00:45:00+08:00'}));
});
test('server rejects past, off-grid/seconds, blank fields, invalid age and choices',async()=>{
  for(const changes of [{start:'2000-01-01T09:45:00+08:00'},{start:'2090-10-08T09:46:00+08:00'},{start:'2090-10-08T09:45:01+08:00'},{start:'infinity'},{name:' '},{address:' '},{age:-1},{age:121},{doctor:'unknown'},{type:'unknown'}])await rejection(asUser(A,c=>book(c,randomUUID(),{...base,...changes})),'22023');
});
test('idempotent concurrent retries return one row; changed payload/owner rejected',async()=>{
  const id=randomUUID(),v={...base,start:'2090-10-11T09:45:00+08:00'};
  const results=await Promise.all([asUser(A,c=>book(c,id,v)),asUser(A,c=>book(c,id,v))]);assert.equal(results[0].id,results[1].id);
  assert.equal((await pool.query('select count(*)::int count from public.appointments where id=$1',[id])).rows[0].count,1);
  await rejection(asUser(A,c=>book(c,id,{...v,address:'Changed'})),'22023');await rejection(asUser(B,c=>book(c,id,v)),'42501');
});
test('cancellation retains history, allows rebooking, and retries preserve cancelled result',async()=>{
  const id=randomUUID(),v={...base,start:'2090-10-12T09:45:00+08:00'};await asUser(A,c=>book(c,id,v));
  const cancelled=await asUser(A,c=>c.query('select (public.cancel_appointment($1)).*',[id]));assert.equal(cancelled.rows[0].status,'cancelled');assert.ok(cancelled.rows[0].cancelled_at);
  await asUser(A,c=>c.query('select public.cancel_appointment($1)',[id]));
  assert.equal((await asUser(A,c=>book(c,id,v))).status,'cancelled');await asUser(B,c=>book(c,randomUUID(),v));
});
test('started visit cannot be cancelled; same-payload past retry is recoverable',async()=>{
  const id=randomUUID();await pool.query("insert into public.appointments(id,owner_uid,doctor_id,type_id,doctor_name,type_name,patient_name,patient_address,patient_age,confirmation_email,start_at,end_at) values($1,$2,'dr-smith','general-check-up','Dr. Smith','General Check-up','Patient','Manila',25,'a@example.test','2000-01-01T09:45:00+08','2000-01-01T10:45:00+08')",[id,A]);
  await rejection(asUser(A,c=>c.query('select public.cancel_appointment($1)',[id])),'22023');assert.equal((await asUser(A,c=>book(c,id,{...base,start:'2000-01-01T09:45:00+08:00'}))).id,id);
});
test('extension, catalog lists, fixed search_path and RPC-only grants are explicit',async()=>{
  assert.equal((await pool.query("select count(*)::int count from pg_extension where extname='btree_gist'")).rows[0].count,1);
  assert.equal((await asUser(A,c=>c.query('select * from public.doctors'))).rowCount,9);assert.equal((await asUser(A,c=>c.query('select * from public.appointment_types'))).rowCount,10);
  const functions=await pool.query("select p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('book_appointment','cancel_appointment')");assert.equal(functions.rowCount,2);for(const f of functions.rows){assert.equal(f.prosecdef,true);assert.ok(f.proconfig.includes('search_path=""'));}
});

async function asService(operation){const c=await pool.connect();try{await c.query('begin');await c.query('set local role service_role');const result=await operation(c);await c.query('commit');return result;}catch(error){await c.query('rollback');throw error;}finally{c.release();}}
const claim=(uid,id,attempt=randomUUID())=>asService(c=>c.query('select public.claim_appointment_confirmation($1,$2,$3) result',[id,uid,attempt])).then(r=>r.rows[0].result);
test('notification RPCs are service-only and verify actual identity and ownership',async()=>{
  const a=await asUser(A,c=>book(c,randomUUID(),{...base,start:'2090-10-15T09:45:00+08:00'}));
  await rejection(asUser(A,c=>c.query('select public.claim_appointment_confirmation($1,$2,$3)',[a.id,A,randomUUID()])),'42501');
  await rejection(asUser(null,c=>c.query('select public.claim_appointment_confirmation($1,$2,$3)',[a.id,A,randomUUID()]),'anon'),'42501');
  await rejection(claim(B,a.id),'42501');await rejection(claim(U,a.id),'42501');
  await rejection(asUser(A,c=>c.query('select * from public.appointment_notifications')),'42501');
  await rejection(asService(c=>c.query('select * from public.appointment_notifications')),'42501');
  await asUser(A,c=>c.query('select public.cancel_appointment($1)',[a.id]));await rejection(claim(A,a.id),'22023');
});
test('durable concurrent notification claims return trusted snapshots exactly once',async()=>{
  const a=await asUser(A,c=>book(c,randomUUID(),{...base,start:'2090-10-16T09:45:00+08:00'}));
  const attempt=randomUUID();const results=await Promise.all([claim(A,a.id,attempt),claim(A,a.id)]);
  assert.equal(results.filter(r=>r.claimed).length,1);const winner=results.find(r=>r.claimed);
  assert.equal(winner.appointment.confirmation_email,'a@example.test');assert.equal(winner.appointment.patient_name,'Patient');
  const row=(await pool.query('select * from public.appointment_notifications where appointment_id=$1',[a.id])).rows[0];
  await rejection(asService(c=>c.query('select public.finish_appointment_confirmation($1,$2,$3,$4)',[a.id,randomUUID(),'accepted','message'])),'22023');
  await asService(c=>c.query('select public.finish_appointment_confirmation($1,$2,$3,$4)',[a.id,row.attempt_id,'accepted','message']));
  assert.deepEqual(await claim(A,a.id),{claimed:false,state:'accepted'});
});
test('failed/uncertain notifications retain booking and cannot be automatically reclaimed',async()=>{
  for(const state of ['failed','unknown','sending']){
    const a=await asUser(A,c=>book(c,randomUUID(),{...base,doctor:'dr-brown',start:`2090-10-${state==='failed'?'17':state==='unknown'?'18':'19'}T09:45:00+08:00`}));
    const attempt=randomUUID();assert.equal((await claim(A,a.id,attempt)).claimed,true);
    if(state!=='sending')await asService(c=>c.query('select public.finish_appointment_confirmation($1,$2,$3,$4)',[a.id,attempt,state,null]));
    assert.deepEqual(await claim(A,a.id),{claimed:false,state});assert.equal((await asUser(A,c=>c.query('select status from public.appointments where id=$1',[a.id]))).rows[0].status,'active');
  }
});

test('production handler with real SQL claim sends once and keeps booking on mocked Brevo failure',async()=>{
  for(const fail of [false,true]){
    const a=await asUser(A,c=>book(c,randomUUID(),{...base,start:`2090-10-${fail?'21':'20'}T09:45:00+08:00`}));let sends=0;
    const handler=createHandler({origins:['http://localhost:5173'],sender:{name:'MediSched',email:'jomaricandido18@gmail.com'},configured:()=>true,
      authenticate:async token=>token==='fixture-token'?{id:A,email_confirmed_at:'2030-01-01'}:null,
      claim:async(id,uid,attempt)=>claim(uid,id,attempt),
      finish:async(id,attempt,state,message)=>asService(c=>c.query('select public.finish_appointment_confirmation($1,$2,$3,$4)',[id,attempt,state,message])),
      send:async body=>{sends++;assert.equal(body.to[0].email,'a@example.test');return new Response(JSON.stringify(fail?{}:{messageId:'mock-provider-id'}),{status:fail?400:201});}
    });
    const request=()=>new Request('http://local/function',{method:'POST',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json'},body:JSON.stringify({appointmentId:a.id})});
    await Promise.all([handler(request()),handler(request())]);assert.equal(sends,1);
    const retry=await handler(request());assert.equal(retry.status,fail?409:200);assert.equal(sends,1);
    assert.equal((await asUser(A,c=>c.query('select status from public.appointments where id=$1',[a.id]))).rows[0].status,'active');
    assert.equal((await pool.query('select state from public.appointment_notifications where appointment_id=$1',[a.id])).rows[0].state,fail?'failed':'accepted');
  }
});

const slots=(uid,date,doctor='dr-smith',role='authenticated')=>asUser(uid,c=>c.query('select * from public.list_available_slots($1,$2)',[doctor,date]),role);
const times=result=>result.rows.map(r=>new Date(r.start_at.valueOf()+8*3600000).toISOString().slice(11,16));

test('approved daily clinic windows are read-only and availability is verified-only',async()=>{
  await pool.query('delete from public.clinic_hours');
  await pool.query('insert into public.clinic_hours select day,opens,closes from generate_series(1,7) day cross join (values (480,720),(780,1020)) windows(opens,closes)');
  assert.equal((await asUser(A,c=>c.query('select * from public.clinic_hours'))).rowCount,14);
  assert.equal((await asUser(U,c=>c.query('select * from public.clinic_hours'))).rowCount,0);
  await rejection(slots(null,'2090-10-22','dr-smith','anon'),'42501');
  await rejection(slots(U,'2090-10-22'),'42501');
  await rejection(asService(c=>c.query("select * from public.list_available_slots('dr-smith','2090-10-22')")),'42501');
  await rejection(asUser(A,c=>c.query('delete from public.clinic_hours')),'42501');
  await rejection(asUser(A,c=>c.query('insert into public.clinic_hours values(1,0,60)')),'42501');
  const fn=(await pool.query("select prosecdef,proconfig from pg_proc where oid='public.list_available_slots(text,date)'::regprocedure")).rows[0];
  assert.equal(fn.prosecdef,true);assert.ok(fn.proconfig.includes('search_path=""'));
});

test('all seven days offer only complete one-hour visits before lunch and closing',async()=>{
  const expected=['08:00','08:15','08:30','08:45','09:00','09:15','09:30','09:45','10:00','10:15','10:30','10:45','11:00','13:00','13:15','13:30','13:45','14:00','14:15','14:30','14:45','15:00','15:15','15:30','15:45','16:00'];
  for(let day=22;day<=28;day++)assert.deepEqual(times(await slots(A,`2090-10-${day}`)),expected);
});

test('booking cannot bypass clinic hours, lunch overlap or the last start boundary',async()=>{
  for(const time of ['07:45','11:15','11:30','11:45','12:00','12:45','16:15','16:45','17:00','23:45'])await rejection(asUser(A,c=>book(c,randomUUID(),{...base,start:`2090-10-29T${time}:00+08:00`})),'22023');
  for(const time of ['11:00','13:00','16:00'])assert.ok((await asUser(A,c=>book(c,randomUUID(),{...base,start:`2090-10-29T${time}:00+08:00`}))).id);
});

test('availability excludes other owners and minute overlaps without disclosing patient rows',async()=>{
  const a=await asUser(B,c=>book(c,randomUUID(),{...base,start:'2090-10-30T09:45:00+08:00'}));
  assert.equal((await asUser(A,c=>c.query('select * from public.appointments where id=$1',[a.id]))).rowCount,0);
  const available=await slots(A,'2090-10-30');
  for(const row of available.rows)assert.deepEqual(Object.keys(row),['start_at']);
  for(const time of ['09:00','09:15','09:30','09:45','10:00','10:15','10:30'])assert.ok(!times(available).includes(time));
  for(const time of ['08:45','10:45'])assert.ok(times(available).includes(time));
  assert.equal((await slots(A,'2090-10-30','dr-brown')).rowCount,26);
});

test('two available snapshots do not permit simultaneous double booking; cancellation releases times',async()=>{
  const date='2090-10-31',start=`${date}T09:45:00+08:00`;
  for(const uid of [A,B])assert.ok(times(await slots(uid,date)).includes('09:45'));
  const results=await Promise.allSettled([asUser(A,c=>book(c,randomUUID(),{...base,start})),asUser(B,c=>book(c,randomUUID(),{...base,start}))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const failure=results.find(r=>r.status==='rejected').reason;assert.equal(failure.code,'23P01');assert.equal(failure.detail,undefined);
  const saved=results.find(r=>r.status==='fulfilled').value;
  assert.ok(!times(await slots(A,date)).includes('09:45'));
  await asUser(saved.owner_uid,c=>c.query('select public.cancel_appointment($1)',[saved.id]));
  assert.equal((await slots(B,date)).rowCount,26);
  assert.equal((await pool.query('select status from public.appointments where id=$1',[saved.id])).rows[0].status,'cancelled');
});

test('today is future-only, past is empty, invalid doctor/date and inactive choices fail',async()=>{
  const now=await pool.query("select clock_timestamp() as time,(clock_timestamp() at time zone 'Asia/Manila')::date::text as date");
  const today=await slots(A,now.rows[0].date);for(const row of today.rows)assert.ok(row.start_at>now.rows[0].time);
  assert.equal((await slots(A,'2000-01-01')).rowCount,0);
  for(const date of [null,'infinity','10000-01-01'])await rejection(slots(A,date),'22023');
  await rejection(slots(A,'2090-11-01','unknown'),'22023');
  await pool.query("update public.doctors set active=false where id='dr-garcia'");
  try{await rejection(slots(A,'2090-11-01','dr-garcia'),'22023');}finally{await pool.query("update public.doctors set active=true where id='dr-garcia'");}
});

test('preexisting out-of-hours history survives new hours; retries and cancellation still work',async()=>{
  const saved=(await pool.query("select * from public.appointments where start_at='2090-10-09T23:45:00+08' and owner_uid=$1",[A])).rows[0];
  assert.equal((await asUser(A,c=>book(c,saved.id,{...base,start:'2090-10-09T23:45:00+08:00'}))).id,saved.id);
  await asUser(A,c=>c.query('select public.cancel_appointment($1)',[saved.id]));
  assert.equal((await pool.query('select status from public.appointments where id=$1',[saved.id])).rows[0].status,'cancelled');
  await rejection(asUser(B,c=>book(c,randomUUID(),{...base,start:'2090-10-09T23:45:00+08:00'})),'22023');
});
