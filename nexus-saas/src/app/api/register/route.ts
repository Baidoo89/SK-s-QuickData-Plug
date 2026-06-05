import { NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { z } from "zod"
import { db as prisma } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"
import { isSubscriptionActive } from "@/lib/subscription-access"
import { generateEmailVerificationToken } from "@/lib/tokens"
import { getBaseUrl, sendEmailVerificationEmail, sendSignupNotificationEmail } from "@/lib/mail"

const optionalText = (min = 1) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(min).optional(),
  )

const registerSchema = z.object({
  accountType: z.enum(["SUBSCRIBER", "AGENT", "RESELLER"]),
  name: z.string().trim().min(2),
  orgName: optionalText(2),
  email: z.string().trim().email(),
  phoneNumber: optionalText(1),
  password: z.string().min(8),
  agentId: optionalText(1),
})

async function issueEmailVerification(email: string) {
  const verificationToken = await generateEmailVerificationToken(email)

  try {
    await sendEmailVerificationEmail(email, verificationToken.token)
    return { emailDelivery: "SENT" as const }
  } catch (error) {
    console.error("Email verification delivery failed:", error)
    return { emailDelivery: "FAILED" as const }
  }
}

function verificationResponseMessage(emailDelivery: "SENT" | "FAILED") {
  if (emailDelivery === "FAILED") {
    return "Account created, but the verification email could not be delivered. Use resend verification after email settings are fixed."
  }

  return "Account created. Check your email to verify your account."
}

function normalizePhoneNumber(value?: string) {
  const digits = String(value || "").replace(/\D/g, "")
  if (!digits) return null
  if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`
  if (digits.length === 10) return digits
  return null
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return ApiErrors.VALIDATION_ERROR(parsed.error.flatten().fieldErrors)
    }

    const { accountType, email, password, name, orgName, agentId } = parsed.data

    if (agentId && accountType !== "RESELLER") {
      return ApiErrors.BAD_REQUEST("Agent invite links can only be used for reseller signup")
    }

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedPhone = normalizePhoneNumber(parsed.data.phoneNumber)

    if (parsed.data.phoneNumber && !normalizedPhone) {
      return ApiErrors.BAD_REQUEST("Phone number must be a valid Ghana number")
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: normalizedEmail, mode: "insensitive" } },
          ...(normalizedPhone ? [{ phoneNumber: normalizedPhone }] : []),
        ],
      },
      select: { id: true },
    })

    if (existingUser) {
      return ApiErrors.CONFLICT("User already exists")
    }

    const hashedPassword = await hash(password, 10)

    if (accountType === "SUBSCRIBER") {
      if (!orgName) {
        return ApiErrors.BAD_REQUEST("Organization name is required")
      }

      const slug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "")

      const existingOrg = await prisma.organization.findUnique({
        where: { slug },
      })

      if (existingOrg) {
        return ApiErrors.CONFLICT("Organization name already taken")
      }

      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: orgName,
            slug,
            active: true,
          },
        })

        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            name,
            password: hashedPassword,
            role: "SUBSCRIBER",
            active: true,
            signupStatus: "APPROVED",
            emailVerificationRequired: true,
            phoneNumber: normalizedPhone,
            organizationId: org.id,
          },
        })

        return { org, user }
      })

      const verification = await issueEmailVerification(normalizedEmail)

      return apiSuccess(
        {
          message: "User created successfully. Verify your email before signing in.",
          user: result.user,
          emailDelivery: verification.emailDelivery,
        },
        verificationResponseMessage(verification.emailDelivery),
        201,
      )
    }

    if (accountType === "AGENT") {
      if (!orgName) {
        return ApiErrors.BAD_REQUEST("Organization name or slug is required")
      }

      const normalizedOrgInput = orgName.trim().toLowerCase()

      const organization = await prisma.organization.findFirst({
        where: {
          OR: [
            { slug: normalizedOrgInput },
            { name: { equals: orgName.trim(), mode: "insensitive" } },
          ],
        },
        include: { subscription: true },
      })

      if (!organization) {
        return ApiErrors.NOT_FOUND("Organization not found. Ask your admin for the correct organization name or slug.")
      }

      if (!organization.active || !isSubscriptionActive(organization.subscription)) {
        return ApiErrors.SUBSCRIPTION_REQUIRED()
      }

      const result = await prisma.$transaction(async (tx) => {
        const agent = await tx.agent.create({
          data: {
            name,
            organizationId: organization.id,
            active: false,
          },
        })

        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            name,
            password: hashedPassword,
            role: "AGENT",
            active: false,
            signupStatus: "PENDING",
            emailVerificationRequired: true,
            phoneNumber: normalizedPhone,
            organizationId: organization.id,
            agentId: agent.id,
          },
        })

        return { agent, user }
      })

      const verification = await issueEmailVerification(normalizedEmail)

      const owner = await prisma.user.findFirst({
        where: { organizationId: organization.id, role: "SUBSCRIBER" },
        select: { email: true },
      })
      if (owner?.email) {
        await sendSignupNotificationEmail({
          to: owner.email,
          subject: "New agent signup request",
          title: "New agent request",
          message: `${name} requested agent access for ${organization.name}. Review the request from your approvals page.`,
          actionLabel: "Open approvals",
          actionHref: `${getBaseUrl()}/dashboard/approvals`,
        }).catch(() => null)
      }

      return apiSuccess(
        { message: "Agent signup request submitted", user: result.user, emailDelivery: verification.emailDelivery },
        verification.emailDelivery === "FAILED"
          ? "Agent request submitted, but the verification email could not be delivered."
          : "Agent signup request submitted. Verify your email, then wait for admin approval.",
        201
      )
    }

    if (!agentId) {
      return ApiErrors.BAD_REQUEST("Agent ID is required for reseller signup")
    }

    const parentAgent = await prisma.agent.findFirst({
      where: {
        id: agentId,
        active: true,
        organization: { active: true },
      },
      include: { organization: { include: { subscription: true } } },
    })

    if (!parentAgent) {
      return ApiErrors.NOT_FOUND("Approved agent not found")
    }

    if (!isSubscriptionActive(parentAgent.organization.subscription)) {
      return ApiErrors.SUBSCRIPTION_REQUIRED()
    }

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name,
        password: hashedPassword,
        role: "RESELLER",
        active: false,
        signupStatus: "PENDING",
        emailVerificationRequired: true,
        phoneNumber: normalizedPhone,
        organizationId: parentAgent.organizationId,
        parentAgentId: parentAgent.id,
      },
    })

    const verification = await issueEmailVerification(normalizedEmail)

    const agentOwner = await prisma.user.findFirst({
      where: { agentId: parentAgent.id, role: "AGENT" },
      select: { email: true },
    })
    if (agentOwner?.email) {
      await sendSignupNotificationEmail({
        to: agentOwner.email,
        subject: "New reseller signup request",
        title: "New reseller request",
        message: `${name} requested reseller access under your agent account. Review the request from your approvals page.`,
        actionLabel: "Open approvals",
        actionHref: `${getBaseUrl()}/agent/approvals`,
      }).catch(() => null)
    }

    return apiSuccess(
      { message: "Reseller signup request submitted", user, emailDelivery: verification.emailDelivery },
      verification.emailDelivery === "FAILED"
        ? "Reseller request submitted, but the verification email could not be delivered."
        : "Reseller signup request submitted. Verify your email, then wait for agent approval.",
      201
    )
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
