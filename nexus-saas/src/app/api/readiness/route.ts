import { NextResponse } from "next/server"

import { db } from "@/lib/db"
import { getEnvironmentReadiness } from "@/lib/env-readiness"

export const dynamic = "force-dynamic"

export async function GET() {
  const env = getEnvironmentReadiness()
  let databaseOk = false

  try {
    await db.$queryRaw`SELECT 1`
    databaseOk = true
  } catch {
    databaseOk = false
  }

  const ok = env.ok && databaseOk

  return NextResponse.json(
    {
      ok,
      database: databaseOk ? "connected" : "unavailable",
      environment: env.environment,
      missingRequired: env.missingRequired.map((item) => ({
        key: item.key,
        description: item.description,
      })),
      warnings: env.warnings.map((item) => ({
        key: item.key,
        description: item.description,
      })),
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  )
}
