import { requireAuth, isAuthError } from "@/lib/auth-guard";
import { apiSuccess, ApiErrors, logApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/mail";

interface CheckoutBody {
  amount?: number;
  returnPath?: string;
}

export async function POST(req: Request) {
  try {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) {
      return authResult;
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    const baseUrl = getBaseUrl();
    if (!secret || !baseUrl) {
      return ApiErrors.INTERNAL_ERROR({ reason: "Paystack not configured" });
    }

    const body = (await req.json().catch(() => null)) as CheckoutBody | null;
    if (!body || typeof body !== "object") {
      return ApiErrors.BAD_REQUEST("Invalid body");
    }

    const rawAmount = Number(body.amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return ApiErrors.BAD_REQUEST("Invalid top up amount");
    }

    const user = await db.user.findUnique({ where: { id: authResult.user.id } });
    if (!user || !user.email) {
      return ApiErrors.NOT_FOUND("User");
    }

    // Convert GHS to pesewas (1 GHS = 100 pesewas)
    const amountInPesewas = Math.round(rawAmount * 100);

    const defaultReturnPath = user.role === "RESELLER" ? "/reseller/wallet" : "/dashboard/wallet";
    const safeReturnPath =
      typeof body.returnPath === "string" && body.returnPath.startsWith("/")
        ? body.returnPath
        : defaultReturnPath;

    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: amountInPesewas,
        metadata: {
          purpose: "wallet_topup",
          walletUserId: user.id,
          walletUserEmail: user.email,
          walletUserRole: user.role,
          walletTopupAmountGHS: rawAmount,
          returnPath: safeReturnPath,
        },
        callback_url: `${baseUrl}/api/wallet/paystack/verify`,
      }),
    });

    if (!paystackResponse.ok) {
      logApiError("PAYSTACK_WALLET_INIT_ERROR", await paystackResponse.text());
      return ApiErrors.INTERNAL_ERROR();
    }

    const paystackData = await paystackResponse.json().catch(() => null);
    if (!paystackData?.status || !paystackData.data?.authorization_url) {
      return ApiErrors.INTERNAL_ERROR();
    }

    return apiSuccess({
      authorizationUrl: paystackData.data.authorization_url as string,
      accessCode: paystackData.data.access_code as string,
      reference: paystackData.data.reference as string,
    });
  } catch (error) {
    logApiError("[WALLET_PAYSTACK_CHECKOUT]", error);
    return ApiErrors.INTERNAL_ERROR();
  }
}
