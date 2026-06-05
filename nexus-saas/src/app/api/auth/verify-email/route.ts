import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"

export async function POST(req: Request) {
  try {
    const { token } = await req.json().catch(() => ({}))
    const cleanToken = String(token || "").trim()

    if (!cleanToken) {
      return ApiErrors.BAD_REQUEST("Verification token is required")
    }

    const existingToken = await db.verificationToken.findUnique({
      where: { token: cleanToken },
    })

    if (!existingToken || existingToken.type !== "EMAIL") {
      return ApiErrors.BAD_REQUEST("Invalid verification link")
    }

    if (existingToken.expires < new Date()) {
      await db.verificationToken.delete({ where: { id: existingToken.id } }).catch(() => null)
      return ApiErrors.BAD_REQUEST("Verification link has expired")
    }

    const user = await db.user.findFirst({
      where: { email: { equals: existingToken.identifier, mode: "insensitive" } },
      select: { id: true },
    })

    if (!user) {
      return ApiErrors.NOT_FOUND("User")
    }

    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: {
          emailVerified: new Date(),
          emailVerificationRequired: false,
        },
      }),
      db.verificationToken.deleteMany({
        where: { identifier: existingToken.identifier, type: "EMAIL" },
      }),
    ])

    return apiSuccess({ verified: true }, "Email verified")
  } catch (error) {
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
