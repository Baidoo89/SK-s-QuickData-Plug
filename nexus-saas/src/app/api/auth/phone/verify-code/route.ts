import { auth } from "@/auth"
import { db } from "@/lib/db"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"

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
    const code = String(body.code || "").trim()

    if (!phoneNumber || !code) {
      return ApiErrors.BAD_REQUEST("Phone number and code are required")
    }

    const existingToken = await db.verificationToken.findFirst({
      where: { identifier: phoneNumber, token: code, type: "PHONE" },
    })

    if (!existingToken) return ApiErrors.BAD_REQUEST("Invalid verification code")

    if (existingToken.expires < new Date()) {
      await db.verificationToken.delete({ where: { id: existingToken.id } }).catch(() => null)
      return ApiErrors.BAD_REQUEST("Verification code has expired")
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })

    if (!user) return ApiErrors.UNAUTHORIZED()

    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { phoneNumber, phoneVerified: new Date() },
      }),
      db.verificationToken.deleteMany({
        where: { identifier: phoneNumber, type: "PHONE" },
      }),
    ])

    return apiSuccess({ verified: true }, "Phone number verified")
  } catch (error) {
    logApiError("[PHONE_VERIFY_CODE]", error)
    return ApiErrors.INTERNAL_ERROR()
  }
}
