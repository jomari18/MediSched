import {otpToken} from './otp.js';
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
// Recovery authority lives only in this closure, on an isolated in-memory Auth client.
export function createPasswordRecovery({auth,otpLength,resendCooldownSeconds,now=Date.now}) {
  let email='',requested=false,proof=null,nextResendAt=0,hasSession=false,passwordUpdated=false,complete=false;
  const snapshot=()=>({email,requested,verified:Boolean(proof),remaining:Math.max(0,Math.ceil((nextResendAt-now())/1000)),passwordUpdated,complete});
  async function cleanup(){
    proof=null;
    if(hasSession){const {error}=await auth.signOut({scope:'local'});if(error)throw error;hasSession=false;}
  }
  async function setEmail(value){
    const next=normalizeEmail(value);if(next===email)return;
    email=next;requested=false;complete=false;await cleanup();
  }
  async function request(value){
    if(snapshot().remaining)throw Error('Wait for the resend cooldown before requesting another code.');
    const next=normalizeEmail(value);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next))throw Error('Enter a valid email address.');
    if(passwordUpdated)throw Error('Finish ending the recovery session before requesting another code.');
    await cleanup();email=next;requested=false;complete=false;nextResendAt=now()+resendCooldownSeconds*1000;
    const {error}=await auth.resetPasswordForEmail(email);if(error)throw error;requested=true;
  }
  async function verify(value){
    proof=null;if(!requested||passwordUpdated)throw Error('Request a recovery code for this email first.');
    const token=otpToken(value,otpLength);
    const {data,error}=await auth.verifyOtp({email,token,type:'recovery'});if(error)throw error;
    hasSession=Boolean(data?.session);
    const user=data?.session?.user;
    if(!user?.id||normalizeEmail(user.email)!==email||user.is_anonymous){await cleanup();throw Error('Recovery verification did not establish a session for this email. Request a new code.');}
    proof={id:user.id,email};
  }
  async function finish(){
    if(!passwordUpdated)throw Error('Verify your recovery code and update your password first.');
    await cleanup();complete=true;requested=false;
  }
  async function update(password,confirmation){
    if(!proof||passwordUpdated)throw Error('Verify your recovery code before changing the password.');
    if(String(password).length<8)throw Error('Choose a password with at least 8 characters.');
    if(password!==confirmation)throw Error('Passwords do not match.');
    const checked=await auth.getUser();
    if(checked.error||checked.data?.user?.id!==proof.id||normalizeEmail(checked.data?.user?.email)!==proof.email){await cleanup();requested=false;throw Error('Your recovery session expired. Request and verify a new code.');}
    const {error}=await auth.updateUser({password});if(error)throw error;
    passwordUpdated=true;proof=null;await finish();
  }
  async function cancel(){requested=false;proof=null;await cleanup();passwordUpdated=false;complete=false;}
  return {snapshot,setEmail,request,verify,update,finish,cancel};
}
