type EnvCheck = {
  key: string
  ok: boolean
  required: boolean
  description: string
}

function hasEnv(key: string) {
  return Boolean(process.env[key]?.trim())
}

function hasAnyEnv(keys: string[]) {
  return keys.some(hasEnv)
}

export function getEnvironmentReadiness() {
  const checks: EnvCheck[] = [
    {
      key: "DATABASE_URL",
      ok: hasEnv("DATABASE_URL"),
      required: true,
      description: "Database connection string for Prisma.",
    },
    {
      key: "NEXTAUTH_URL or APP_URL",
      ok: hasAnyEnv(["NEXTAUTH_URL", "APP_URL"]),
      required: true,
      description: "Base URL used for auth callbacks, emails, and payment redirects.",
    },
    {
      key: "NEXTAUTH_SECRET or AUTH_SECRET",
      ok: hasAnyEnv(["NEXTAUTH_SECRET", "AUTH_SECRET"]),
      required: true,
      description: "Strong secret used to sign auth sessions.",
    },
    {
      key: "PAYMENT_SETTINGS_ENCRYPTION_KEY",
      ok: hasEnv("PAYMENT_SETTINGS_ENCRYPTION_KEY"),
      required: true,
      description: "Encrypts subscriber Paystack secrets stored in the database.",
    },
    {
      key: "PAYSTACK_SECRET_KEY or PAYSTACK_SUBSCRIPTION_SECRET_KEY",
      ok: hasAnyEnv(["PAYSTACK_SECRET_KEY", "PAYSTACK_SUBSCRIPTION_SECRET_KEY"]),
      required: false,
      description: "Required before live SaaS subscription billing.",
    },
    {
      key: "RESEND_API_KEY and RESEND_FROM_EMAIL",
      ok: hasEnv("RESEND_API_KEY") && hasEnv("RESEND_FROM_EMAIL"),
      required: false,
      description: "Required before production email delivery to real users.",
    },
    {
      key: "NEXT_PUBLIC_APP_URL",
      ok: hasEnv("NEXT_PUBLIC_APP_URL"),
      required: false,
      description: "Public app URL shown in API docs and shareable links.",
    },
  ]

  const missingRequired = checks.filter((check) => check.required && !check.ok)
  const warnings = checks.filter((check) => !check.required && !check.ok)

  return {
    ok: missingRequired.length === 0,
    environment: process.env.NODE_ENV || "development",
    checks,
    missingRequired,
    warnings,
  }
}
