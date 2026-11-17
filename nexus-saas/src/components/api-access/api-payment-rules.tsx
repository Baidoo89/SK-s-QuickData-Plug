import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
export function ApiPaymentRules({ creditPath }: { creditPath: string }) {
  return <Card><CardHeader><CardTitle>Wallet funds and approved credit</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground">
    <p>Each API purchase charges your seller cost to the wallet linked to your key. The order is rejected if wallet funds and approved credit cannot cover that cost. Assigned price groups still apply.</p>
    <p>Collect customer payments on your own website first. <code>amountPaid</code> describes that sale; it does not add wallet funds or create withdrawable profit here. The creation response includes <code>walletCharged</code> for the purchase cost.</p>
    <p>Use one <code>externalReference</code> for each purchase and reuse it only to retry the same product, quantity and recipient. Reusing it for another purchase returns a conflict.</p>
    <p>Approved borrowing stays within its limit and is due at midnight GMT. Overdue debt blocks further borrowing. <Link href={creditPath} className="font-medium text-primary underline underline-offset-4">View credit &amp; debt</Link>.</p>
  </CardContent></Card>
}
