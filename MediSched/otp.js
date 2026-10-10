export const OTP_STORAGE_KEY='medisched.signupVerification';
export function otpConfig(settings) {
  const {otpLength=6,resendCooldownSeconds=60}=settings.auth??{};
  if(!Number.isInteger(otpLength)||otpLength<6||otpLength>10)throw Error('Configure an OTP length between 6 and 10 to match Supabase Auth.');
  if(!Number.isInteger(resendCooldownSeconds)||resendCooldownSeconds<60||resendCooldownSeconds>3600)throw Error('Configure a resend cooldown from 60 to 3600 seconds.');
  return {otpLength,resendCooldownSeconds};
}
export function otpToken(value,length) {
  const token=String(value).trim();
  if(!new RegExp(`^[0-9]{${length}}$`).test(token))throw Error(`Enter the ${length}-digit email code.`);
  return token;
}
export function readVerification(storage) {
  try {const value=JSON.parse(storage.getItem(OTP_STORAGE_KEY));
    return {email:typeof value?.email==='string'?value.email:'',nextResendAt:Number.isFinite(value?.nextResendAt)?value.nextResendAt:0};
  }catch{return {email:'',nextResendAt:0};}
}
export function saveVerification(storage,value) {
  // Persist only email and cooldown; never passwords or verification codes.
  try{storage.setItem(OTP_STORAGE_KEY,JSON.stringify({email:value.email,nextResendAt:value.nextResendAt}));}catch{}
}
export function clearVerificationContext(storage) {
  const value={email:'',nextResendAt:readVerification(storage).nextResendAt};
  saveVerification(storage,value);
  return value;
}
export function cooldownRemaining(value,now=Date.now()) {return Math.max(0,Math.ceil((value.nextResendAt-now)/1000));}
