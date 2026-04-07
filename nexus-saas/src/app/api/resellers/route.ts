import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { sendPasswordResetEmail, getBaseUrl } from "@/lib/mail"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { randomUUID } from "crypto"

const createResellerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
})

function buildDebugDetails(error: unknown, context: string) {
  const isProd = process.env.NODE_ENV === "production"

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return {
        status: "conflict" as const,
        message: "A record with this unique value already exists",
        details: isProd ? undefined : { context, code: error.code, target: error.meta?.target },
      }
    }

    return {
      status: "internal" as const,
      details: isProd ? undefined : { context, code: error.code, reason: error.message },
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    const reason = error.message
    const staleClientHint = reason.includes("Unknown argument `active`")
      ? "Prisma client/schema mismatch detected. Run `npx prisma generate` and restart the server."
      : reason

    return {
      status: "bad_request" as const,
      message: staleClientHint,
      details: isProd ? undefined : { context, reason },
    }
  }

  if (error instanceof Error) {
    return {
      status: "internal" as const,
      details: isProd ? undefined : { context, reason: error.message },
    }
  }

  return {
    status: "internal" as const,
    details: isProd ? undefined : { context, reason: "Unknown error" },
  }
}

export async function POST(req: Request) {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user: authUser } = authResult

    if (!authUser.organizationId) {
      return ApiErrors.BAD_REQUEST("User not linked to organization")
    }

    const organizationId = authUser.organizationId
    const fullUser = await db.user.findUnique({
      where: { id: authUser.id },
      select: { agentId: true },
    })

    // Agent portal access is based on linked agent profile, not only user.role.
    // For legacy records, auto-link when there is exactly one agent in the org.
    let agentId = fullUser?.agentId ?? null
    if (!agentId) {
      const candidates = await db.agent.findMany({
        where: { organizationId },
        select: { id: true },
        take: 2,
      })

      if (candidates.length === 1) {
        agentId = candidates[0].id
        await db.user.update({
          where: { id: authUser.id },
          data: { agentId, role: "AGENT" },
        })
      } else {
        return ApiErrors.BAD_REQUEST("Agent profile not linked to this account. Ask admin to relink your agent login.")
      }
    }

    const body = await req.json()
    const parsed = createResellerSchema.safeParse(body)
    if (!parsed.success) return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)

    const { name, email } = parsed.data
    const normalizedEmail = email.trim().toLowerCase()

    // Create a new reseller account (do not silently reuse existing accounts)
    let user = await db.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    })

    if (user) {
      if (user.organizationId === organizationId && user.role === "RESELLER") {
        return ApiErrors.CONFLICT("A reseller with this email already exists in your organization")
      }
      return ApiErrors.CONFLICT("Email is already in use by another account")
    }

    user = await db.user.create({
      data: {
        name,
        email: normalizedEmail,
        role: "RESELLER",
        active: true,
        parentAgent: {
          connect: { id: agentId },
        },
        organization: {
          connect: { id: organizationId },
        },
      },
    })

    // Generate an invite token so the reseller can set their password
    const token = randomUUID()
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)

    await db.passwordResetToken.create({
      data: {
        email: normalizedEmail,
        token,
        expires,
      },
    })

    const baseUrl = getBaseUrl()
    const inviteUrl = `${baseUrl}/new-password?token=${token}`

    let emailSent = false
    try {
      await sendPasswordResetEmail(normalizedEmail, token)
      emailSent = true
    } catch (emailError) {
      logApiError("[RESELLERS_EMAIL_SEND]", emailError)
      // Continue even if email fails - invite URL is still returned in UI
    }

    return apiSuccess(
      { user, inviteUrl, emailSent },
      emailSent
        ? "Reseller created successfully. Invitation email sent."
        : "Reseller created. Email could not be sent, use the invite link below.",
      201
    )
  } catch (error) {
    const debug = buildDebugDetails(error, "RESELLERS_POST")
    logApiError("[RESELLERS_POST]", error)

    if (debug.status === "conflict") {
      return ApiErrors.CONFLICT(debug.message)
    }

    if (debug.status === "bad_request") {
      return ApiErrors.BAD_REQUEST(debug.message)
    }

    return ApiErrors.INTERNAL_ERROR(debug.details)
  }
}

export async function GET() {
  try {
    const authResult = await requireAuth()
    if (isAuthError(authResult)) return authResult
    const { user: authUser } = authResult

    if (!authUser.organizationId) {
      return ApiErrors.BAD_REQUEST("User not linked to organization")
    }

    const organizationId = authUser.organizationId
    const fullUser = await db.user.findUnique({
      where: { id: authUser.id },
      select: { agentId: true },
    })

    let agentId = fullUser?.agentId ?? null
    if (!agentId) {
      const candidates = await db.agent.findMany({
        where: { organizationId },
        select: { id: true },
        take: 2,
      })

      if (candidates.length === 1) {
        agentId = candidates[0].id
        await db.user.update({
          where: { id: authUser.id },
          data: { agentId, role: "AGENT" },
        })
      } else {
        return ApiErrors.BAD_REQUEST("Agent profile not linked to this account. Ask admin to relink your agent login.")
      }
    }

    const resellers = await db.user.findMany({
      where: {
        role: "RESELLER",
        organizationId: organizationId,
        parentAgentId: agentId,
      },
      orderBy: { createdAt: "desc" },
    })

    const resellerProfitById = new Map<string, number>()
    await Promise.all(
      resellers.map(async (reseller) => {
        const profitAgg = await db.orderItem.aggregate({
          _sum: { profit: true },
          where: {
            order: {
              organizationId,
              userId: reseller.id,
              status: "COMPLETED",
            },
          },
        })

        resellerProfitById.set(reseller.id, profitAgg._sum.profit ?? 0)
      })
    )

    const payload = resellers.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      active: r.active,
      parentAgentId: r.parentAgentId,
      isOwnedByCurrentAgent: r.parentAgentId === agentId,
      createdAt: r.createdAt,
      profit: resellerProfitById.get(r.id) ?? 0,
    }))

    return apiSuccess(payload)
  } catch (error) {
    const debug = buildDebugDetails(error, "RESELLERS_GET")
    logApiError("[RESELLERS_GET]", error)
    return ApiErrors.INTERNAL_ERROR(debug.details)
  }
}
