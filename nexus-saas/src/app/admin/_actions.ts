"use server"

import { hash } from "bcryptjs"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { db } from "@/lib/db"

export async function requireSuperAdmin() {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role

  if (!session?.user || role !== "SUPERADMIN") {
    redirect("/login")
  }

  return session
}

export async function setOrganizationStatus(formData: FormData) {
  await requireSuperAdmin()

  const organizationId = String(formData.get("organizationId") ?? "")
  const active = String(formData.get("active") ?? "") === "true"

  if (!organizationId) return

  const before = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true, active: true },
  })

  if (!before) return

  await db.organization.update({
    where: { id: organizationId },
    data: { active },
  })

  await db.auditLog.create({
    data: {
      action: active ? "SUPERADMIN_ACTIVATE_ORG" : "SUPERADMIN_DEACTIVATE_ORG",
      targetType: "ORGANIZATION",
      targetId: organizationId,
      organizationId,
      actorName: "Super Admin",
      before: JSON.stringify(before),
      after: JSON.stringify({ ...before, active }),
      meta: JSON.stringify({ source: "admin_businesses" }),
    },
  })

  revalidatePath("/admin")
  revalidatePath("/admin/businesses")
  revalidatePath(`/admin/businesses/${organizationId}`)
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

export async function createSubscriberTenant(formData: FormData) {
  await requireSuperAdmin()

  const orgName = String(formData.get("orgName") ?? "").trim()
  const requestedSlug = String(formData.get("slug") ?? "").trim()
  const ownerName = String(formData.get("ownerName") ?? "").trim()
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const planId = String(formData.get("planId") ?? "")
  const subscriptionStatus = String(formData.get("subscriptionStatus") ?? "ACTIVE")

  if (!orgName || !ownerName || !ownerEmail || !password || !planId) return

  const slug = slugify(requestedSlug || orgName)
  if (!slug || password.length < 6 || !ownerEmail.includes("@")) return

  const [existingOrg, existingUser, plan] = await Promise.all([
    db.organization.findUnique({ where: { slug }, select: { id: true } }),
    db.user.findFirst({
      where: { email: { equals: ownerEmail, mode: "insensitive" } },
      select: { id: true },
    }),
    db.plan.findUnique({ where: { id: planId }, select: { id: true, name: true } }),
  ])

  if (existingOrg || existingUser || !plan) return

  const passwordHash = await hash(password, 10)
  const shouldCreateSubscription = subscriptionStatus !== "NONE"
  const now = new Date()

  const result = await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: orgName, slug, active: true },
    })

    const owner = await tx.user.create({
      data: {
        name: ownerName,
        email: ownerEmail,
        password: passwordHash,
        role: "SUBSCRIBER",
        active: true,
        signupStatus: "APPROVED",
        organizationId: organization.id,
      },
    })

    const subscription = shouldCreateSubscription
      ? await tx.subscription.create({
          data: {
            organizationId: organization.id,
            planId: plan.id,
            status: subscriptionStatus,
            nextBillingAt: subscriptionStatus === "ACTIVE" ? addMonths(now, 1) : null,
            canceledAt: subscriptionStatus === "CANCELED" ? now : null,
            paystackRef: `manual-${organization.id.slice(-8)}-${Date.now()}`,
          },
        })
      : null

    await tx.auditLog.create({
      data: {
        action: "SUPERADMIN_CREATE_SUBSCRIBER_TENANT",
        targetType: "ORGANIZATION",
        targetId: organization.id,
        organizationId: organization.id,
        actorName: "Super Admin",
        after: JSON.stringify({
          organization: { id: organization.id, name: organization.name, slug: organization.slug },
          owner: { id: owner.id, email: owner.email },
          subscription: subscription ? { id: subscription.id, status: subscription.status, planId: subscription.planId } : null,
        }),
        meta: JSON.stringify({ source: "admin_businesses", planName: plan.name }),
      },
    })

    return { organization }
  })

  revalidatePath("/admin")
  revalidatePath("/admin/businesses")
  revalidatePath("/admin/subscriptions")
  redirect(`/admin/businesses?q=${encodeURIComponent(result.organization.slug)}`)
}
