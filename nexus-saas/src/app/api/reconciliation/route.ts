import { requireRole, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, apiError, ApiErrors, logApiError } from "@/lib/api-response"
import { listFinancialReviews, reviewFinancialCase } from "@/lib/financial-review"
export const dynamic = "force-dynamic"
export async function GET(req: Request) {
  const auth = await requireRole(["SUPERADMIN", "SUBSCRIBER"])
  if (isAuthError(auth)) return auth
  try {
    const params = new URL(req.url).searchParams
    const status = params.get("status") ?? "OPEN"
    if (!["OPEN", "REVIEWED", "ALL"].includes(status)) return ApiErrors.BAD_REQUEST("Invalid review filter")
    const raw = Number(params.get("page") ?? "0")
    const page = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 0), 1000) : 0
    return apiSuccess(await listFinancialReviews(auth.user, { status: status as "OPEN" | "REVIEWED" | "ALL", page, query: (params.get("q") ?? "").trim().slice(0, 100) }))
  } catch (error) {
    if (error instanceof Error && error.message === "REVIEW_FORBIDDEN") return ApiErrors.FORBIDDEN()
    logApiError("RECONCILIATION_GET", error); return ApiErrors.INTERNAL_ERROR()
  }
}
export async function POST(req: Request) {
  const auth = await requireRole(["SUPERADMIN", "SUBSCRIBER"])
  if (isAuthError(auth)) return auth
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.id !== "string" || typeof body.version !== "number" || typeof body.note !== "string" || !["OPEN", "REVIEWED"].includes(body.status)) return ApiErrors.BAD_REQUEST("Provide a case, version, review status and note.")
    return apiSuccess(await reviewFinancialCase(auth.user, body))
  } catch (error) {
    if (error instanceof Error && error.message === "REVIEW_FORBIDDEN") return ApiErrors.FORBIDDEN()
    if (error instanceof Error && error.message === "REVIEW_NOT_FOUND") return ApiErrors.NOT_FOUND("Review case")
    if (error instanceof Error && error.message === "INVALID_REVIEW") return ApiErrors.BAD_REQUEST("Include a review note of 10 to 1000 characters.")
    if (error instanceof Error && error.message === "REVIEW_CONFLICT") return apiError("REVIEW_CONFLICT", "This case changed. Refresh and review the latest evidence.", 409)
    logApiError("RECONCILIATION_POST", error); return ApiErrors.INTERNAL_ERROR()
  }
}
