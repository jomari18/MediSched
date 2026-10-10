// Local app targets MediSched-Staging. Public credentials only; no server secrets.
// Match Auth OTP length/cooldown to the project settings.
export const settings = {
  "auth": {
    "otpLength": 8,
    "resendCooldownSeconds": 60
  },
  "supabase": {
    "url": "https://yqqhfnniwysjhtgonhwq.supabase.co",
    "publishableKey": "sb_publishable_yHrAsKCAKG9yJ2wGiRgPBQ_KFn3BX6v"
  }
};
