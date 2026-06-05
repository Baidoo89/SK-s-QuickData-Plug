import { db } from "@/lib/db"
import { generatePasswordResetToken } from "@/lib/tokens"
import { sendPasswordResetEmail } from "@/lib/mail"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    const normalizedEmail = String(email || "").trim().toLowerCase()

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return ApiErrors.BAD_REQUEST("A valid email is required")
    }

    const existingUser = await db.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      select: { email: true },
    })

    if (!existingUser) {
      return apiSuccess({ sent: true }, "If that email exists, a reset link has been sent.")
    }

    const passwordResetToken = await generatePasswordResetToken(normalizedEmail)
    await sendPasswordResetEmail(passwordResetToken.email, passwordResetToken.token)

    return apiSuccess({ sent: true }, "If that email exists, a reset link has been sent.")
  } catch (error) {
    logApiError("[AUTH_RESET]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
