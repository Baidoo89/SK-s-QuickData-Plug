import { requireAuth, isAuthError } from "@/lib/auth-guard"
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response"
import { configureCredit, listCreditAccounts } from "@/lib/credit-account"
export const dynamic = "force-dynamic"
export async function GET(req: Request) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  try { return apiSuccess(await listCreditAccounts(auth.user, (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100))) }
  catch (error) { logApiError("CREDIT_ACCOUNTS_GET", error); return ApiErrors.INTERNAL_ERROR() }
}
export async function POST(req: Request) {
  const auth = await requireAuth()
  if (isAuthError(auth)) return auth
  if (!["SUPERADMIN", "SUBSCRIBER"].includes(auth.user.role)) return ApiErrors.FORBIDDEN()
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.userId !== "string" || typeof body.enabled !== "boolean" || typeof body.limit !== "number" || typeof body.note !== "string") return ApiErrors.BAD_REQUEST("Provide a user, limit, enabled setting and approval note.")
    return apiSuccess(await configureCredit(auth.user, body))
  } catch (error) {
    if (error instanceof Error && error.message === "CREDIT_FORBIDDEN") return ApiErrors.FORBIDDEN()
    if (error instanceof Error && ["INVALID_CREDIT_LIMIT", "INVALID_MONEY"].includes(error.message)) return ApiErrors.BAD_REQUEST("Use a valid credit limit and an approval note of at least three characters.")
    logApiError("CREDIT_ACCOUNTS_POST", error); return ApiErrors.INTERNAL_ERROR()
  }
}
