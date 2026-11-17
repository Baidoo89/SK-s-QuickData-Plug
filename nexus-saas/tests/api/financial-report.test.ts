import { expect, it } from "vitest"
import { summarizeFinancialOrders } from "@/lib/financial-report"

const item = (profit: number) => ({ profit })

it("separates completed wallet, storefront and external sales with exact pesewa totals", () => {
  const result = summarizeFinancialOrders([
    { status: "COMPLETED", total: 0.1, paymentOwner: "WALLET", source: "DASHBOARD_BUY", items: [item(0.1)] },
    { status: "COMPLETED", total: 0.2, paymentOwner: "STOREFRONT", source: "STOREFRONT", items: [item(0.2)] },
    { status: "COMPLETED", total: 0.3, paymentOwner: "EXTERNAL", source: "API", items: [item(0.3)] },
    { status: "FAILED", total: 50, paymentOwner: "WALLET", source: "DASHBOARD_BUY", items: [item(50)] },
  ])

  expect(result).toEqual({
    completedOrders: 3,
    grossSales: 0.6,
    walletBackedSales: 0.1,
    storefrontSales: 0.2,
    externalSales: 0.3,
    grossMargin: 0.6,
    withdrawalEligibleMargin: 0.3,
    externalMargin: 0.3,
  })
})

it("treats legacy API rows as external when payment owner metadata is missing", () => {
  const result = summarizeFinancialOrders([{ status: "COMPLETED", total: 1.25, source: "API", items: [item(0.25)] }])
  expect(result.externalSales).toBe(1.25)
  expect(result.externalMargin).toBe(0.25)
  expect(result.withdrawalEligibleMargin).toBe(0)
})
