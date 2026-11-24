import { expect, it } from "vitest"
import { parsePaystackMetadata } from "@/lib/paystack-metadata"

it("parses Paystack stringified metadata", () => {
  expect(parsePaystackMetadata(JSON.stringify({ purpose: "storefront_order", organizationId: "org_1" }))).toEqual({
    purpose: "storefront_order",
    organizationId: "org_1",
  })
})

it("keeps object metadata compatible with local fixtures", () => {
  const metadata = { purpose: "wallet_topup", walletUserId: "user_1" }
  expect(parsePaystackMetadata(metadata)).toBe(metadata)
})

it("rejects malformed or non-object metadata safely", () => {
  expect(parsePaystackMetadata("not-json")).toEqual({})
  expect(parsePaystackMetadata("[]")).toEqual({})
  expect(parsePaystackMetadata(null)).toEqual({})
})
