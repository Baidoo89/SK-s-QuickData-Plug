import Link from "next/link"

export function PreviewNotice() {
  return (
    <aside className="mb-5 space-y-3 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm">
      <p><strong>Local preview · sample data.</strong> No real payments or data deliveries. Some management screens need a configured test database.</p>
      <nav aria-label="Preview screens" className="flex flex-wrap gap-x-5 gap-y-3 font-semibold text-primary">
        <Link href="/?view=setup">Owner setup</Link>
        <Link href="/?view=products">Products & prices</Link>
        <Link href="/?role=agent">Agent buying</Link>
        <Link href="/?role=reseller">Reseller buying</Link>
        <Link href="/?view=store">Customer shop</Link>
      </nav>
    </aside>
  )
}
