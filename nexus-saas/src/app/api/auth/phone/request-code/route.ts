import { auth } from "@/auth"
import { db } from "@/lib/db"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { sendPhoneVerificationCode } from "@/lib/sms"
import { generatePhoneVerificationToken } from "@/lib/tokens"

function normalizePhoneNumber(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "")
  if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`
  if (digits.length === 10) return digits
  return null
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.email) return ApiErrors.UNAUTHORIZED()

    const body = await req.json().catch(() => ({}))
    const phoneNumber = normalizePhoneNumber(body.phoneNumber)
    if (!phoneNumber) return ApiErrors.BAD_REQUEST("A valid Ghana phone number is required")

    const currentUser = await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!currentUser) return ApiErrors.UNAUTHORIZED()

    const owner = await db.user.findFirst({
      where: { phoneNumber, id: { not: currentUser.id } },
      select: { id: true },
    })

    if (owner) return ApiErrors.CONFLICT("Phone number is already in use")

    await db.user.update({
      where: { id: currentUser.id },
      data: { phoneNumber, phoneVerified: null },
    })

    const token = await generatePhoneVerificationToken(phoneNumber)
    await sendPhoneVerificationCode(phoneNumber, token.token)

    return apiSuccess({ sent: true }, "Verification code sent")
  } catch (error) {
    logApiError("[PHONE_REQUEST_CODE]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
