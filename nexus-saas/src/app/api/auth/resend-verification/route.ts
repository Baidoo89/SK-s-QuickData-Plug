import { db } from "@/lib/db"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { sendEmailVerificationEmail } from "@/lib/mail"
import { generateEmailVerificationToken } from "@/lib/tokens"

export async function POST(req: Request) {
  try {
    const { email } = await req.json().catch(() => ({}))
    const normalizedEmail = String(email || "").trim().toLowerCase()

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return ApiErrors.BAD_REQUEST("A valid email is required")
    }

    const user = await db.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      select: { email: true, emailVerified: true },
    })

    if (!user || user.emailVerified) {
      return apiSuccess({ sent: true }, "If verification is needed, an email has been sent.")
    }

    const token = await generateEmailVerificationToken(normalizedEmail)

    try {
      await sendEmailVerificationEmail(normalizedEmail, token.token)
    } catch (error) {
      logApiError("[AUTH_RESEND_VERIFICATION_EMAIL_SEND]", error)

      return apiSuccess(
        {
          sent: false,
          emailDelivery: "FAILED",
          devVerificationPath: process.env.NODE_ENV === "production" ? null : "/dev/verification",
        },
        process.env.NODE_ENV === "production"
          ? "If verification is needed, an email has been sent."
          : "Verification token created, but email delivery failed. Use the development verification helper.",
      )
    }

    return apiSuccess(
      { sent: true, emailDelivery: "SENT" },
      "If verification is needed, an email has been sent.",
    )
  } catch (error) {
    logApiError("[AUTH_RESEND_VERIFICATION]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
