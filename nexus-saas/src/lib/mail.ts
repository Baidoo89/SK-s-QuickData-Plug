import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const configuredFromEmail = process.env.RESEND_FROM_EMAIL?.trim();
const resendFromEmail = configuredFromEmail || "onboarding@resend.dev";

function requireProductionEmailDelivery() {
  if (process.env.NODE_ENV === "production" && (!resendApiKey || !configuredFromEmail)) {
    throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
  }
}

export function getBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  // Vercel provides these values automatically. They keep links usable when
  // the canonical URL variables were missed during deployment setup.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }
  if (process.env.NODE_ENV === "production") return "https://www.techdalt.com";
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

  requireProductionEmailDelivery();

  // In development, keep the link visible in the server console when Resend
  // has not been configured yet.
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

  requireProductionEmailDelivery();

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

  requireProductionEmailDelivery();

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
