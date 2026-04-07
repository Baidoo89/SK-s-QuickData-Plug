import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

export function getBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return "http://localhost:3000";
}

export const sendPasswordResetEmail = async (
  email: string,
  token: string
) => {
  const resetLink = `${getBaseUrl()}/new-password?token=${token}`;

  // If no API key is configured, fallback to console log
  if (!resendApiKey || !resend) {
    console.log("========================================");
    console.log(`[DEV MODE] Sending password reset email to ${email}`);
    console.log(`Reset Link: ${resetLink}`);
    console.log("========================================");
    return;
  }

  const result = await resend.emails.send({
    from: resendFromEmail,
    to: email,
    subject: "Reset your password",
    html: `<p>Click <a href="${resetLink}">here</a> to reset your password.</p>`
  });

  if (result.error) {
    throw new Error(result.error.message || "Failed to send password reset email");
  }
};
