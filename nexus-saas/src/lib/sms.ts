export async function sendPhoneVerificationCode(phoneNumber: string, code: string) {
  console.log("========================================")
  console.log(`[DEV MODE] Sending phone verification code to ${phoneNumber}`)
  console.log(`Verification Code: ${code}`)
  console.log("========================================")
}
