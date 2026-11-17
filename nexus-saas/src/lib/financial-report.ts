import { moneyToMinor, minorToMoney } from "@/lib/money"

export type FinancialReportOrder = {
  status: string
  total: number
  source?: string | null
  paymentOwner?: string | null
  items: Array<{ profit: number }>
}

export type FinancialReportBreakdown = {
  completedOrders: number
  grossSales: number
  walletBackedSales: number
  storefrontSales: number
  externalSales: number
  grossMargin: number
  withdrawalEligibleMargin: number
  externalMargin: number
}

/**
 * Keep the report labels aligned with wallet and withdrawal policy. API orders
 * are externally collected even when older rows have incomplete owner metadata.
 */
export function summarizeFinancialOrders(orders: FinancialReportOrder[]): FinancialReportBreakdown {
  let completedOrders = 0
  let grossSalesMinor = 0
  let walletBackedSalesMinor = 0
  let storefrontSalesMinor = 0
  let externalSalesMinor = 0
  let grossMarginMinor = 0
  let withdrawalEligibleMarginMinor = 0
  let externalMarginMinor = 0

  for (const order of orders) {
    if (order.status !== "COMPLETED") continue
    completedOrders += 1
    const totalMinor = moneyToMinor(order.total)
    grossSalesMinor += totalMinor
    const isExternal = order.source === "API" || order.paymentOwner === "EXTERNAL"
    if (isExternal) externalSalesMinor += totalMinor
    else if (order.paymentOwner === "STOREFRONT") storefrontSalesMinor += totalMinor
    else if (order.paymentOwner === "WALLET") walletBackedSalesMinor += totalMinor

    const orderMarginMinor = order.items.reduce((sum, item) => sum + moneyToMinor(item.profit), 0)
    grossMarginMinor += orderMarginMinor
    if (order.source !== "API") withdrawalEligibleMarginMinor += orderMarginMinor
    if (isExternal) externalMarginMinor += orderMarginMinor
  }

  return {
    completedOrders,
    grossSales: minorToMoney(grossSalesMinor),
    walletBackedSales: minorToMoney(walletBackedSalesMinor),
    storefrontSales: minorToMoney(storefrontSalesMinor),
    externalSales: minorToMoney(externalSalesMinor),
    grossMargin: minorToMoney(grossMarginMinor),
    withdrawalEligibleMargin: minorToMoney(withdrawalEligibleMarginMinor),
    externalMargin: minorToMoney(externalMarginMinor),
  }
}
