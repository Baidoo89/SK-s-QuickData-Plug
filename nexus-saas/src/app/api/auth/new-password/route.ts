import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return ApiErrors.BAD_REQUEST("Missing required fields")
    }

    const existingToken = await db.passwordResetToken.findUnique({
      where: { token }
    })

    if (!existingToken) {
      return ApiErrors.BAD_REQUEST("Invalid token")
    }

    const hasExpired = new Date(existingToken.expires) < new Date()

    if (hasExpired) {
      return ApiErrors.BAD_REQUEST("Token has expired")
    }

    const existingUser = await db.user.findFirst({
      where: { email: { equals: existingToken.email, mode: "insensitive" } }
    })

    if (!existingUser) {
      return ApiErrors.NOT_FOUND("User")
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await db.user.update({
      where: { id: existingUser.id },
      data: { password: hashedPassword }
    })

    await db.passwordResetToken.delete({
      where: { id: existingToken.id }
    })

    return apiSuccess({ success: true, message: "Password updated!" })
  } catch (error) {
    return ApiErrors.INTERNAL_ERROR()
  }
}
