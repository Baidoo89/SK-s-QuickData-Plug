import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { generatePasswordResetToken } from "@/lib/tokens"
import { sendPasswordResetEmail } from "@/lib/mail"
import { apiSuccess, ApiErrors } from "@/lib/api-response"

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    const normalizedEmail = String(email || "").trim().toLowerCase()

    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail }
    })

    if (!existingUser) {
      return ApiErrors.NOT_FOUND("User")
    }

    const passwordResetToken = await generatePasswordResetToken(normalizedEmail)
    await sendPasswordResetEmail(passwordResetToken.email, passwordResetToken.token)

    return apiSuccess({ success: true, message: "Reset email sent!" })
  } catch (error) {
    return new NextResponse("Internal Error", { status: 500 });
  }
}
