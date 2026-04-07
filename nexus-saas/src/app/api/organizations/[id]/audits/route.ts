import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, isAuthError } from "@/lib/auth-guard"
import { apiSuccess } from "@/lib/api-response"

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const authResult = await requireAdmin()
    if (isAuthError(authResult)) return authResult

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "10")
    const skip = (page - 1) * pageSize

    const orgId = params.id

    const [items, total] = await Promise.all([
      db.auditLog.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      db.auditLog.count({ where: { organizationId: orgId } }),
    ])

    return apiSuccess({ items, total, page, pageSize })
  } catch (error) {
    console.error("[ORG_AUDITS]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}
