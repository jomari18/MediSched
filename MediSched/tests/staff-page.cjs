// Chromium check that the clinic workspace opens for staff, with mocked Supabase (same harness as browser.cjs).
// It guards the page against scripts that look for markup the page no longer has.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const base='http://127.0.0.1:5175';
const {mockModule}=require('./browser-mock.cjs');

(async()=>{
 const server=spawn(process.execPath,['tools/serve.js'],{env:{...process.env,MEDISCHED_PORT:'5175'},stdio:'pipe'});
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Preview exited '+code)));});
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const catalogs=await import('../domain.js');
  const user={id:'user-a',email:'a@example.test',email_confirmed_at:'2030-01-01'};
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await context.addInitScript(({user,doctors,types})=>{if(!sessionStorage.getItem('mock.initialized')){sessionStorage.setItem('mock.initialized','yes');sessionStorage.setItem('mock.user',JSON.stringify(user));sessionStorage.setItem('mock.records','[]');sessionStorage.setItem('mock.staff','yes');}window.loginUser=user;window.catalogs={doctors,types};},{user,doctors:catalogs.DOCTORS,types:catalogs.TYPES});
  await context.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:mockModule}));
  await context.route('https://cdn.jsdelivr.net/**',route=>route.abort());
  await context.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const settings={auth:{otpLength:6,resendCooldownSeconds:60},supabase:{url:'https://medisched-test.invalid',publishableKey:'sb_publishable_mock'}};"}));
  context.setDefaultTimeout(10000);
  const p=await context.newPage();
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/staff.html');
  await p.locator('#staffContent').waitFor({state:'visible'});
  assert.equal(await p.locator('#gateStatus').isVisible(),false);
  await p.locator('#openAnalytics').evaluate(b=>b.click());
  await p.getByText('Visit-date totals · Asia/Manila',{exact:false}).waitFor({state:'attached'});
  assert.deepEqual(errors,[]);
  console.log('Staff workspace opened with clinic analytics and no page errors.');
 }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
