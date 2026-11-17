import { PortalShell } from "@/components/navigation/portal-shell"
import { SingleDataPurchase } from "@/components/purchases/single-data-purchase"
import { SetupChecklist, type SetupItem } from "@/components/dashboard/setup-checklist"
import { SimpleBuySections } from "@/components/storefront/simple-buy-sections"
import { Package } from "lucide-react"
import { PreviewNotice } from "./preview-notice"
import ProductsPage from "@/app/dashboard/products/page"

// A separate test app imports production UI with fixture data. It has no database,
// auth, payment or provider credentials and adds no routes to the real application.
export default async function FixturePage(
  props: { searchParams: Promise<{ view?: string; role?: string; done?: string }> }
) {
  const searchParams = await props.searchParams;
  if (searchParams.view === "products") return <PortalShell role="owner"><PreviewNotice /><ProductsPage /></PortalShell>
  if (searchParams.view === "store") return <div className="mx-auto max-w-5xl p-4"><PreviewNotice /><SimpleBuySections subscriberSlug="test-shop" storeActive bundles={[
    { id: "mtn-1", name: "1 GB", provider: "MTN", effectivePrice: 5 },
    { id: "tel-5", name: "5 GB", provider: "TELECEL", effectivePrice: 20 },
  ]} /></div>
  const role = searchParams.role === "reseller" ? "reseller" : "agent"
  if (searchParams.view === "setup") {
    const done = Number(searchParams.done ?? 2)
    const items: SetupItem[] = [
      { label: "Activate your business account", href: "/dashboard/settings", action: "Review business settings", description: "Activate your account.", complete: done > 0, required: true, icon: Package },
      { label: "Choose your selling plan", href: "/dashboard/subscription", action: "Manage plan", description: "Activate a selling plan.", complete: done > 1, required: true, icon: Package },
      { label: "Connect customer payments", href: "/dashboard/settings#payments", action: "Connect Paystack", description: "Connect your Paystack account to accept payments.", complete: done > 2, required: true, icon: Package },
      { label: "Add your bundles", href: "/dashboard/products", action: "Add bundles", description: "Add the bundles you sell.", complete: done > 3, required: true, icon: Package },
      { label: "Set your selling prices", href: "/dashboard/products", action: "Set prices", description: "Choose your customer prices.", complete: done > 4, required: true, icon: Package },
    ]
    return <PortalShell role="owner"><PreviewNotice /><SetupChecklist requiredItems={items} optionalItems={[{ label: "Website integration", description: "Optional API tools.", href: "/dashboard/settings#website-api", action: "Manage API keys", complete: false, required: false, icon: Package }]} storePath="/store/test-shop" /></PortalShell>
  }
  return <PortalShell role={role}><PreviewNotice /><SingleDataPurchase role={role} /></PortalShell>
}
