import Link from "next/link"
import FixturePage from "../page"
import { PreviewNotice } from "../preview-notice"
import { PortalShell } from "@/components/navigation/portal-shell"

export default async function PreviewRoute(props: { params: Promise<{ path: string[] }> }) {
  const params = await props.params;
  const [area, section] = params.path
  if (area === "store") return <FixturePage searchParams={Promise.resolve({ view: "store" })} />
  if (area === "dashboard" && section === "products") return <FixturePage searchParams={Promise.resolve({ view: "products" })} />
  if (area === "dashboard" && (!section || section === "setup")) return <FixturePage searchParams={Promise.resolve({ view: "setup" })} />
  if ((area === "agent" || area === "reseller") && (!section || section === "buy" || section === "buy-data")) return <FixturePage searchParams={Promise.resolve({ role: area })} />
  const content = <><PreviewNotice /><section className="mx-auto w-full max-w-2xl space-y-4 rounded-lg border border-border bg-card p-6"><h1 className="text-2xl font-bold">{area === "preview-payment" ? "Payment preview" : "Full test environment needed"}</h1><p className="text-sm leading-6 text-muted-foreground">{area === "preview-payment" ? "In the full app, the previous step opens Paystack to collect payment. This sample preview stops here. No payment was taken and no data will be delivered." : "This screen uses real account and transaction data in the full app. The local preview lets you review the redesigned setup and purchase screens using sample data. Demo orders are not saved."}</p><Link href="/?view=setup" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Return to owner setup</Link></section></>
  return area === "preview-payment" ? <div className="mx-auto max-w-5xl p-4">{content}</div> : <PortalShell role={area === "reseller" ? "reseller" : area === "agent" ? "agent" : "owner"}>{content}</PortalShell>
}
