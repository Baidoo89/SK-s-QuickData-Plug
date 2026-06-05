import { NextResponse } from "next/server";
import { ApiErrors, logApiError } from "@/lib/api-response";

import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/mail";
import { getOrganizationPaymentSettings } from "@/lib/organization-payment-settings";

export const dynamic = "force-dynamic";

function resolveWalletReturnPath(meta: Record<string, unknown>): string {
  const rawReturnPath = typeof meta.returnPath === "string" ? meta.returnPath : "";
  if (rawReturnPath.startsWith("/")) return rawReturnPath;

  const role = typeof meta.walletUserRole === "string" ? meta.walletUserRole : "";
  if (role === "RESELLER") return "/reseller/wallet";
  if (role === "AGENT") return "/agent/wallet";
  return "/dashboard/wallet";
}

export async function GET(req: Request) {
  try {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return ApiErrors.INTERNAL_ERROR({ reason: "App URL not configured" });
    }

    const { searchParams } = new URL(req.url);
    const reference = searchParams.get("reference");
    const organizationId = searchParams.get("organizationId");

    if (!reference) {
      return ApiErrors.BAD_REQUEST("Missing reference");
    }
    if (!organizationId) {
      return ApiErrors.BAD_REQUEST("Missing organization");
    }

    const paymentSettings = await getOrganizationPaymentSettings(organizationId);
    if (!paymentSettings.paystackConnected || !paymentSettings.paystackSecretKey) {
      return ApiErrors.BAD_REQUEST("Subscriber Paystack is not connected");
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${paymentSettings.paystackSecretKey}`,
      },
    });

    if (!response.ok) {
      logApiError("PAYSTACK_WALLET_VERIFY_ERROR", await response.text());
      return ApiErrors.BAD_REQUEST("Payment verification failed");
    }

    const data = await response.json().catch(() => null);
    const meta = (data?.data?.metadata || {}) as Record<string, unknown>;
    const returnPath = resolveWalletReturnPath(meta);

    if (!data?.status || data.data?.status !== "success") {
      const failRedirect = `${baseUrl}${returnPath}?walletTopup=failed`;
      return NextResponse.redirect(failRedirect);
    }

    const walletUserId = typeof meta.walletUserId === "string" ? meta.walletUserId : undefined;
    const metadataOrganizationId = typeof meta.organizationId === "string" ? meta.organizationId : undefined;

    if (!walletUserId || metadataOrganizationId !== organizationId) {
      console.error("Missing or mismatched wallet metadata in Paystack response");
      const failRedirect = `${baseUrl}${returnPath}?walletTopup=failed`;
      return NextResponse.redirect(failRedirect);
    }

    const amountFromMeta = typeof meta.walletTopupAmountGHS === "number" ? meta.walletTopupAmountGHS : undefined;
    const amountFromResponse = typeof data.data?.amount === "number" ? data.data.amount / 100 : undefined;
    const finalAmount = amountFromMeta ?? amountFromResponse;

    if (!finalAmount || finalAmount <= 0) {
      console.error("Invalid wallet top up amount from Paystack", {
        amountFromMeta,
        amountFromResponse,
      });
      const failRedirect = `${baseUrl}${returnPath}?walletTopup=failed`;
      return NextResponse.redirect(failRedirect);
    }

    // Create wallet transaction record
    await db.walletTransaction.create({
      data: {
        userId: walletUserId,
        performedByEmail: typeof meta.walletUserEmail === "string" ? meta.walletUserEmail : null,
        performedByRole: typeof meta.walletUserRole === "string" ? meta.walletUserRole : null,
        method: "paystack",
        amount: finalAmount,
        status: "success",
      },
    });

    const successRedirect = `${baseUrl}${returnPath}?walletTopup=success`;
    return NextResponse.redirect(successRedirect);
  } catch (error) {
    logApiError("[WALLET_PAYSTACK_VERIFY]", error);
    const baseUrl = getBaseUrl();
    const failRedirect = baseUrl ? `${baseUrl}/dashboard/wallet?walletTopup=failed` : undefined;
    if (failRedirect) {
      return NextResponse.redirect(failRedirect);
    }
    return ApiErrors.INTERNAL_ERROR();
  }
}
