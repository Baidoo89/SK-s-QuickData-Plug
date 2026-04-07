const ghanaCediFormatter = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatGhanaCedis(amount: number): string {
  return ghanaCediFormatter.format(amount)
}
