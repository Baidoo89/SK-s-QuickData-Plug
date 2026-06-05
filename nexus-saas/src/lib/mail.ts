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
  const html = `
    <p>You requested a password reset.</p>
    <p><a href="${resetLink}">Reset your password</a></p>
    <p>This link expires in 1 hour. If you did not request it, you can ignore this email.</p>
  `;

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
    html,
  });

  if (result.error) {
    throw new Error(result.error.message || "Failed to send password reset email");
  }
};

export const sendEmailVerificationEmail = async (email: string, token: string) => {
  const verifyLink = `${getBaseUrl()}/verify-email?token=${token}`;
  const html = `
    <p>Welcome. Please verify your email address to secure your account.</p>
    <p><a href="${verifyLink}">Verify email address</a></p>
    <p>This link expires in 24 hours.</p>
  `;

  if (!resendApiKey || !resend) {
    console.log("========================================");
    console.log(`[DEV MODE] Sending verification email to ${email}`);
    console.log(`Verification Link: ${verifyLink}`);
    console.log("========================================");
    return;
  }

  const result = await resend.emails.send({
    from: resendFromEmail,
    to: email,
    subject: "Verify your email",
    html,
  });

  if (result.error) {
    throw new Error(result.error.message || "Failed to send verification email");
  }
};

export const sendSignupNotificationEmail = async (input: {
  to: string;
  subject: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
}) => {
  const html = `
    <p><strong>${input.title}</strong></p>
    <p>${input.message}</p>
    ${input.actionHref ? `<p><a href="${input.actionHref}">${input.actionLabel || "Open dashboard"}</a></p>` : ""}
  `;

  if (!resendApiKey || !resend) {
    console.log("========================================");
    console.log(`[DEV MODE] Notification email to ${input.to}`);
    console.log(`Subject: ${input.subject}`);
    console.log(input.message);
    if (input.actionHref) console.log(`Action: ${input.actionHref}`);
    console.log("========================================");
    return;
  }

  const result = await resend.emails.send({
    from: resendFromEmail,
    to: input.to,
    subject: input.subject,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message || "Failed to send notification email");
  }
};
