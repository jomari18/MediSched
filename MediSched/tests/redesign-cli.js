// Prepared by tools/prepare-redesign-cli.js; execute only through Playwright CLI.
async page=>{
 const mockModule=MOCK_MODULE;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.context().route('https://esm.sh/**',r=>r.fulfill({contentType:'text/javascript',body:mockModule.replace("value.token!=='001234'","value.token!=='00123456'")}));
 await page.context().addInitScript(()=>{
  localStorage.setItem('medisched.theme','light');
  window.loginUser={id:'synthetic-owner',email:'patient@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'};
  window.catalogs={doctors:[{id:'dr-smith',name:'Dr. Smith'}],types:[{id:'general-check-up',name:'General Check-up'}]};
 });
 const check=(v,m)=>{if(!v)throw Error(m)};const captures=[];
 const capture=async(name)=>{check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow: '+name);await page.screenshot({path:'evidence/redesign-'+name+'.png',fullPage:await page.locator('dialog[open]').count()===0,animations:'disabled'});captures.push(name);};
 await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:5173/index.html');await capture('landing-desktop');
 await page.locator('.landing-header [data-switch=register]').click();await page.locator('#registerName').fill('Synthetic Patient');await page.locator('#registerEmail').fill('patient@example.test');await page.locator('#registerPassword').fill('synthetic-password');await page.locator('#confirmPassword').fill('synthetic-password');await capture('register-desktop');
 await page.locator('#registerForm button[type=submit]').click();await page.locator('#verifyPanel').waitFor({state:'visible'});check(await page.locator('#verificationCode').getAttribute('maxlength')==='8','8 digit OTP retained');await capture('otp-desktop');
 await page.locator('#verificationCode').fill('00123456');await page.locator('#verifyForm button[type=submit]').click();await page.waitForURL('**/dashboard.html');await page.locator('#dashboardContent').waitFor({state:'visible'});
 await page.locator('#scheduleBtn').click();await page.locator('#patientName').fill('Synthetic Patient');await page.locator('#patientAge').fill('25');await page.locator('#patientAddress').fill('Synthetic address');await page.locator('#doctorName').selectOption('dr-smith');await page.locator('#appointmentType').selectOption('general-check-up');
 const tomorrow=await page.evaluate(()=>new Date(Date.now()+86400000).toISOString().slice(0,10));await page.locator('#appointmentDate').fill(tomorrow);await page.locator('#appointmentDate').dispatchEvent('change');await page.locator('.slot-buttons button').first().waitFor();await page.locator('.slot-buttons button').first().click();
 await page.locator('.slot-buttons button').first().focus();await page.keyboard.press('Enter');
 check(await page.locator('.slot-buttons button').first().evaluate(b=>document.activeElement===b),'slot selection retains keyboard focus');
 check(await page.locator('#appointmentTime').inputValue()!=='','slot button updates original input');check(await page.locator('#reserveAppointment').isEnabled(),'reserve enabled');await capture('booking-desktop');
 for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await capture('booking-'+width);await page.locator('#reserveAppointment').scrollIntoViewIfNeeded();const box=await page.locator('#reserveAppointment').boundingBox();check(box.y>=0&&box.y+box.height<=844,'booking submit reachable '+width);await capture('booking-actions-'+width);}
 await page.evaluate(()=>window.notificationFailure=true);await page.locator('#reserveAppointment').click();await page.locator('#scheduleModal').waitFor({state:'hidden'});await page.getByText('Appointment saved; confirmation email could not be sent',{exact:false}).waitFor();check(await page.locator('.appointment-card').count()===1,'booking survives email failure');
 await page.setViewportSize({width:1440,height:1000});await capture('patient-desktop');
 for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await capture('patient-'+width);}
 await page.setViewportSize({width:390,height:844});await page.locator('.appointment-card .secondary').click();await page.locator('#detailsDialog').waitFor({state:'visible'});await capture('details-phone');await page.keyboard.press('Escape');
 await page.locator('[data-cancel]').click();await page.locator('#confirmYes').click();await page.getByText('Appointment cancelled. Availability released.',{exact:true}).waitFor();await page.locator('[data-filter=cancelled]').click();check(await page.locator('.appointment-card').count()===1,'cancelled history retained');await capture('history-phone');
 await page.locator('#logout').click();await page.waitForURL('**/index.html');await capture('landing-phone');await page.locator('.landing-header [data-switch=login]').click();await capture('signin-phone');
 await page.locator('#loginEmail').fill('patient@example.test');await page.locator('#loginPassword').fill('synthetic-password');await page.locator('[data-password=loginPassword]').click();check(await page.locator('#loginPassword').getAttribute('type')==='text','show password');await page.locator('#loginPanel [data-switch=register]').click();check(await page.locator('#loginPassword').getAttribute('type')==='password','visibility reset');await capture('register-phone');
 await page.setViewportSize({width:1440,height:1000});await page.locator('#registerPanel [data-switch=login]').click();await capture('signin-desktop');
 await page.goto('http://127.0.0.1:5173/index.html?code=expired');await page.getByText('Email confirmation could not complete.',{exact:false}).waitFor({state:'visible'});
 await page.goto('http://127.0.0.1:5173/index.html?reason=session-ended');await page.getByText('Your session ended. Please sign in again.',{exact:true}).waitFor({state:'visible'});
 check(errors.length===0,'Page errors: '+errors.join('; '));return {status:'pass',mode:'synthetic Supabase, no hosted writes or emails',captures,errors};
}
