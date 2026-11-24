import { getWalletPaystackSecret } from "@/lib/paystack"
import { NextResponse } from "next/server";
import { ApiErrors, logApiError } from "@/lib/api-response";

import { recordVerifiedWalletTopup } from "@/lib/wallet-topup";
import { getBaseUrl } from "@/lib/mail";
import { getOrganizationPaymentSettings } from "@/lib/organization-payment-settings";
import { parsePaystackMetadata } from "@/lib/paystack-metadata";

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

    const fundingOwner = searchParams.get("fundingOwner") || "SUBSCRIBER"
    if (fundingOwner !== "PLATFORM" && fundingOwner !== "SUBSCRIBER") return ApiErrors.BAD_REQUEST("Invalid wallet payment owner")
    const paymentSettings = fundingOwner === "SUBSCRIBER" ? await getOrganizationPaymentSettings(organizationId) : null
    const secret = fundingOwner === "PLATFORM" ? getWalletPaystackSecret() : paymentSettings?.paystackConnected ? paymentSettings.paystackSecretKey : null
    if (!secret) return ApiErrors.BAD_REQUEST("Wallet payment provider is not configured")

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    });

    if (!response.ok) {
      logApiError("PAYSTACK_WALLET_VERIFY_ERROR", await response.text());
      return ApiErrors.BAD_REQUEST("Payment verification failed");
    }

    const data = await response.json().catch(() => null);
    const meta = parsePaystackMetadata(data?.data?.metadata);
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

    await recordVerifiedWalletTopup({ organizationId, reference, fundingOwner, payment: data.data });

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
