import Link from "next/link"
import { notFound } from "next/navigation"
import { revalidatePath } from "next/cache"
import { CheckCircle2, Copy, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { db } from "@/lib/db"
import { getBaseUrl } from "@/lib/mail"
import { generateEmailVerificationToken } from "@/lib/tokens"
import { DevCopyButton } from "./dev-copy-button"

export const dynamic = "force-dynamic"

function assertDevOnly() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("This development helper is disabled in production.")
  }
}

async function verifyUserAction(formData: FormData) {
  "use server"

  assertDevOnly()

  const userId = String(formData.get("userId") || "").trim()
  if (!userId) return

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  })

  if (!user?.email) return

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        emailVerificationRequired: false,
      },
    }),
    db.verificationToken.deleteMany({
      where: { identifier: user.email.toLowerCase(), type: "EMAIL" },
    }),
  ])

  revalidatePath("/dev/verification")
}

async function regenerateTokenAction(formData: FormData) {
  "use server"

  assertDevOnly()

  const email = String(formData.get("email") || "").trim().toLowerCase()
  if (!email) return

  await generateEmailVerificationToken(email)
  revalidatePath("/dev/verification")
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("en-GH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

export default async function DevVerificationPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  const users = await db.user.findMany({
    where: {
      email: { not: null },
      OR: [
        { emailVerificationRequired: true },
        { emailVerified: null },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      signupStatus: true,
      emailVerified: true,
      emailVerificationRequired: true,
      createdAt: true,
      organization: {
        select: { name: true, slug: true },
      },
      agent: {
        select: { name: true },
      },
      parentAgent: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  const emails = users.map((user) => user.email).filter((email): email is string => Boolean(email))
  const tokens = emails.length
    ? await db.verificationToken.findMany({
        where: {
          type: "EMAIL",
          identifier: { in: emails.map((email) => email.toLowerCase()) },
        },
        orderBy: { createdAt: "desc" },
      })
    : []

  const tokenByEmail = new Map<string, (typeof tokens)[number]>()
  for (const token of tokens) {
    if (!tokenByEmail.has(token.identifier.toLowerCase())) {
      tokenByEmail.set(token.identifier.toLowerCase(), token)
    }
  }

  const baseUrl = getBaseUrl()

  return (
    <main className="app-shell-bg min-h-screen px-4 py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
              Development only
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Email Verification Helper</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Use this local-only page to test signup when Resend/domain verification is not ready. This route is hidden in production.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/login">Back to login</Link>
          </Button>
        </div>

        <Card className="border-warning/30 bg-warning/10">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4" />
              Local testing note
            </CardTitle>
            <CardDescription className="text-warning-foreground">
              This page is for development only. In production, users verify by email through Resend.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending verification accounts</CardTitle>
            <CardDescription>
              Recent accounts without verified email. Regenerate a token when no link is available, or mark verified directly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <div className="rounded-md border border-border bg-background p-6 text-sm text-muted-foreground">
                No pending email verification accounts found.
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => {
                  const email = user.email ?? ""
                  const token = tokenByEmail.get(email.toLowerCase())
                  const verificationLink = token ? `${baseUrl}/verify-email?token=${token.token}` : null
                  const tokenExpired = token ? token.expires < new Date() : false

                  return (
                    <div key={user.id} className="rounded-md border border-border bg-card p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">{user.name || "Unnamed user"}</p>
                            <Badge variant="outline">{user.role}</Badge>
                            <Badge variant={user.signupStatus === "APPROVED" ? "secondary" : "outline"}>
                              {user.signupStatus}
                            </Badge>
                            {user.emailVerified ? (
                              <Badge variant="secondary" className="bg-success/10 text-success">
                                Verified
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-warning/40 text-warning">
                                Unverified
                              </Badge>
                            )}
                          </div>
                          <p className="break-all text-sm text-muted-foreground">{email}</p>
                          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                            <p>Organization: {user.organization?.name || "-"}</p>
                            <p>Agent: {user.agent?.name || user.parentAgent?.name || "-"}</p>
                            <p>Created: {formatDate(user.createdAt)}</p>
                            <p>Token expires: {formatDate(token?.expires)}</p>
                          </div>
                          {verificationLink ? (
                            <div className="rounded-md border border-border bg-background p-3">
                              <p className="mb-2 text-xs font-medium text-muted-foreground">
                                Verification link {tokenExpired ? "(expired)" : ""}
                              </p>
                              <p className="break-all font-mono text-xs text-foreground">{verificationLink}</p>
                            </div>
                          ) : (
                            <p className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                              No active email verification token found for this account.
                            </p>
                          )}
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3 lg:w-[360px] lg:grid-cols-1">
                          {verificationLink ? (
                            <>
                              <Button asChild size="sm" variant="outline">
                                <Link href={verificationLink} target="_blank">
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Open link
                                </Link>
                              </Button>
                              <DevCopyButton value={verificationLink}>
                                <Copy className="mr-2 h-4 w-4" />
                                Copy link
                              </DevCopyButton>
                            </>
                          ) : null}

                          <form action={regenerateTokenAction}>
                            <input type="hidden" name="email" value={email} />
                            <Button type="submit" size="sm" variant="outline" className="w-full">
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Regenerate token
                            </Button>
                          </form>

                          <form action={verifyUserAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <Button type="submit" size="sm" className="w-full">
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Mark verified
                            </Button>
                          </form>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
