async page => {
  const assert=(condition,message)=>{if(!condition)throw Error(message);};
  const mock=`export function createClient(url,key,options){
    const recovery=options.auth.storageKey==='medisched.recovery.memory';
    if(recovery){window.recoveryOptions=options;let user=null;return {auth:{
      async resetPasswordForEmail(email){window.resetRequests=(window.resetRequests||0)+1;window.resetEmail=email;return {error:window.resetError||null};},
      async verifyOtp(input){window.verifyType=input.type;if(input.type!=='recovery'||input.token!=='00123456')return {data:{},error:{code:'otp_expired'}};user={id:'patient',email:input.email,email_confirmed_at:'2026-01-01'};window.recoverySession=true;return {data:{user,session:{user}},error:null};},
      async getUser(){return {data:{user},error:null};},
      async updateUser(input){if(window.updateError)return {error:window.updateError};window.passwordUpdates=(window.passwordUpdates||0)+1;return {data:{user},error:null};},
      async signOut(){if(window.cleanupError)return {error:window.cleanupError};user=null;window.recoverySession=false;window.cleanupCount=(window.cleanupCount||0)+1;return {error:null};}
    }};}
    window.normalOptions=options;return {auth:{async getSession(){return {data:{session:null},error:null};},async getUser(){return {data:{user:null},error:null};},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};},async signOut(){window.normalSignouts=(window.normalSignouts||0)+1;return {error:null};}},async rpc(){throw Error('Recovery must not route into the normal portal');}};
  }`;
  await page.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:mock}));
  await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const settings={auth:{otpLength:8,resendCooldownSeconds:60},supabase:{url:'https://recovery-synthetic.invalid',publishableKey:'sb_publishable_synthetic'}};"}));
  await page.route('https://**/*',route=>route.request().url().startsWith('https://esm.sh/')?route.fallback():route.abort());
  await page.addInitScript(()=>{window.recoveryClockOffset=0;const realNow=Date.now;Date.now=()=>realNow()+window.recoveryClockOffset;});
  await page.goto('http://127.0.0.1:5201/index.html');
  await page.waitForFunction(()=>document.getElementById('authStatus').textContent==='Ready to sign in.');
  assert(await page.locator('#forgotPassword').count()===1,'Sign-in must expose Forgot password');
  await page.locator('.landing-header-actions [data-switch=login]').click();
  await page.locator('#loginEmail').fill('patient@example.test');await page.locator('#forgotPassword').click();
  assert(await page.locator('#recoveryPanel').isVisible(),'Recovery panel opens');
  assert(await page.locator('#recoveryEmail').inputValue()==='patient@example.test','Sign-in email is carried over');
  await page.locator('#recoveryRequest').click();await page.waitForFunction(()=>document.getElementById('authStatus').textContent.includes('If an account'));
  assert(await page.locator('#recoveryRequest').isDisabled(),'Request observes resend cooldown');
  assert(await page.locator('#recoveryPasswordForm').isHidden(),'No password fields before verification');
  await page.locator('#recoveryCode').fill('99999999');await page.locator('#recoveryVerify').click();
  await page.waitForFunction(()=>document.getElementById('authStatus').textContent.includes('expired'));
  assert(await page.locator('#recoveryCode').inputValue()==='','Invalid code cleared');
  assert(await page.locator('#recoveryPasswordForm').isHidden(),'Invalid OTP cannot unlock password update');
  await page.locator('#recoveryCode').fill('00123456');await page.locator('#recoveryVerify').click();
  await page.locator('#recoveryPasswordForm').waitFor({state:'visible'});
  assert(await page.evaluate(()=>window.verifyType)==='recovery','Only recovery OTP verification is used');
  assert(page.url().endsWith('index.html'),'Verified recovery does not route to dashboard');
  await page.locator('#recoveryEmail').fill('other@example.test');await page.waitForFunction(()=>document.getElementById('authStatus').textContent.includes('request a recovery code'));
  assert(await page.locator('#recoveryPasswordForm').isHidden(),'Editing verified email invalidates proof');
  assert(await page.evaluate(()=>window.recoverySession)===false,'Editing verified email ends recovery session');
  assert(await page.locator('#recoveryRequest').isDisabled(),'Email edit does not bypass cooldown');
  await page.locator('#recoveryEmail').fill('patient@example.test');
  await page.evaluate(()=>window.recoveryClockOffset+=61000);
  await page.waitForFunction(()=>!document.getElementById('recoveryRequest').disabled);
  await page.locator('#recoveryRequest').click();await page.waitForFunction(()=>document.getElementById('authStatus').textContent.includes('If an account'));
  await page.locator('#recoveryCode').fill('00123456');await page.locator('#recoveryVerify').click();await page.locator('#recoveryPasswordForm').waitFor({state:'visible'});
  await page.locator('#recoveryPassword').fill('NewPassword123!');await page.locator('#recoveryConfirmation').fill('Different123!');
  await page.locator('#recoverySave').click();await page.waitForFunction(()=>document.getElementById('authStatus').textContent.includes('match'));
  assert(await page.evaluate(()=>window.passwordUpdates||0)===0,'Mismatch cannot update Auth');
  await page.locator('#recoveryPassword').fill('NewPassword123!');await page.locator('#recoveryConfirmation').fill('NewPassword123!');
  await page.evaluate(()=>window.updateError={code:'same_password'});await page.locator('#recoverySave').click();
  await page.waitForFunction(()=>document.getElementById('authStatus').textContent.includes('different'));
  assert(await page.locator('#recoveryPassword').inputValue()==='','Rejected password is cleared');
  await page.evaluate(()=>window.updateError=null);
  await page.evaluate(()=>window.cleanupError={message:'Session cleanup unavailable'});
  await page.locator('#recoveryPassword').fill('NewPassword123!');await page.locator('#recoveryConfirmation').fill('NewPassword123!');
  await page.locator('#recoverySave').click();await page.waitForFunction(()=>document.getElementById('authStatus').textContent.includes('cleanup unavailable'));
  assert(await page.locator('#recoveryFinish').isVisible(),'Failed cleanup offers explicit retry');
  assert(await page.locator('#loginPanel').isHidden(),'Cleanup failure does not report successful sign-in readiness');
  await page.evaluate(()=>window.cleanupError=null);await page.locator('#recoveryFinish').click();
  await page.waitForFunction(()=>document.getElementById('authStatus').textContent.includes('Password updated'));
  assert(await page.evaluate(()=>window.passwordUpdates)===1,'Cleanup retry does not change password again');
  assert(await page.locator('#loginPanel').isVisible(),'Success returns to sign in');
  assert(await page.evaluate(()=>window.recoverySession)===false,'Recovery session ended before success');
  assert(await page.evaluate(()=>window.normalSignouts||0)===0,'No unrelated normal session signout');
  assert(await page.locator('#recoveryPassword').inputValue()==='','Password cleared after success');
  assert(await page.evaluate(()=>window.recoveryOptions.auth.persistSession)===false,'Recovery tokens stay in memory');
  assert(await page.evaluate(()=>window.recoveryOptions.auth.autoRefreshToken)===false,'Recovery has no auto refresh');
  assert(await page.evaluate(()=>Object.keys(localStorage).every(k=>!k.includes('recovery')))===true,'Recovery proof is not persisted');
  await page.locator('#forgotPassword').click();await page.locator('#recoveryEmail').fill('another@example.test');
  assert(await page.locator('#recoveryPasswordForm').isHidden(),'Email edit invalidates completed proof');
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Recovery fits mobile viewport');
  await page.screenshot({path:'evidence/password-recovery-mobile.png',fullPage:true});
  await page.reload();await page.waitForFunction(()=>document.getElementById('authStatus').textContent==='Ready to sign in.');
  await page.locator('.landing-header-actions [data-switch=login]').click();
  assert(await page.locator('#loginPanel').isVisible(),'Reload does not restore recovery authority');
  console.log('PASS MediSched synthetic OTP recovery: request, cooldown, wrong OTP, recovery-only proof, mismatch/same password, cleanup, signin, memory isolation, mobile, reload');
}
