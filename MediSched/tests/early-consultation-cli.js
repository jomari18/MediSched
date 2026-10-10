// Synthetic UI coverage; actual transition rules are tested in isolated PostgreSQL.
async page=>{
 const {mockModule}=require(process.cwd()+'/tests/browser-mock.cjs');
 const mock=mockModule.replace("row.attendance_state='checked_in';row.version=1;row.allowed_actions=['complete'];", "row.attendance_state=input.p_action==='start_consultation'?'in_consultation':'completed';row.version++;row.allowed_actions=row.attendance_state==='in_consultation'?['complete']:[];");
 await page.context().route('https://esm.sh/**',r=>r.fulfill({contentType:'text/javascript',body:mock}));
 await page.context().route('https://**.supabase.co/**',r=>r.abort());
 await page.context().addInitScript(()=>{
  sessionStorage.setItem('mock.user',JSON.stringify({id:'synthetic-staff',email:'staff@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'}));
  sessionStorage.setItem('mock.staff','yes');
  window.catalogs={doctors:[{id:'dr-smith',name:'Dr. Smith'}],types:[{id:'general',name:'General Check-up'}]};
  sessionStorage.setItem('mock.staffRows',JSON.stringify([{id:'11111111-1111-4111-8111-111111111111',patient_name:'Synthetic Patient',doctor_name:'Dr. Smith',doctor_id:'dr-smith',type_name:'General Check-up',start_at:new Date(Date.now()+3600000).toISOString(),end_at:new Date(Date.now()+7200000).toISOString(),status:'active',attendance_state:'checked_in',version:1,allowed_actions:['start_consultation']}]));
 });
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.goto('http://127.0.0.1:5173/staff.html');
  await page.getByRole('button',{name:'Start consultation',exact:true}).click();
  await page.getByRole('button',{name:'Confirm start consultation',exact:true}).click();
  await page.getByRole('button',{name:'Complete',exact:true}).waitFor();
  await page.screenshot({path:'evidence/early-consultation-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:'Complete',exact:true}).click();
  await page.getByRole('button',{name:'Confirm complete',exact:true}).click();
  await page.locator('#staffRows .badge').filter({hasText:'Completed'}).waitFor();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Horizontal overflow');
  const actions=await page.evaluate(()=>window.transitionRequests.map(r=>r.p_action));
  if(actions.join(',')!=='start_consultation,complete')throw Error('Unexpected actions '+actions);
 }
 if(errors.length)throw Error(errors.join('\n'));
 return {status:'pass',viewports:[1440,390],mode:'synthetic UI; no hosted mutations'};
}
