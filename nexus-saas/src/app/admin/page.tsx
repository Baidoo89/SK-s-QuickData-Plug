"use client"

import { useEffect, useState } from "react"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Info } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ToastAction } from "@/components/ui/toast"
import { formatGhanaCedis } from "@/lib/currency"

interface OrgRow {
  id: string
  name: string
  slug: string
  createdAt: string
  users: Array<{ email?: string | null; role: string }>
  activeProductsCount?: number
  active?: boolean
}

interface AdminOverview {
  totalOrgs: number
  activeOrgs: number
  totalOrders: number
  totalRevenue: number
  totalAgents: number
  activeProducts: number
  pendingAudits: number
}

export default function AdminPage() {
  const { toast } = useToast()
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [auditsOpen, setAuditsOpen] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null)
  const [audits, setAudits] = useState<any[]>([])
  const [auditsLoading, setAuditsLoading] = useState(false)
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const safeOrgs = Array.isArray(orgs) ? orgs : []

  useEffect(() => {
    async function loadOverview() {
      try {
        const res = await fetch("/api/admin/overview")
        if (!res.ok) return
        const json = await res.json()
        const payload = json?.data ?? json
        setOverview({
          totalOrgs: Number(payload?.totalOrgs ?? 0),
          activeOrgs: Number(payload?.activeOrgs ?? 0),
          totalOrders: Number(payload?.totalOrders ?? 0),
          totalRevenue: Number(payload?.totalRevenue ?? 0),
          totalAgents: Number(payload?.totalAgents ?? 0),
          activeProducts: Number(payload?.activeProducts ?? 0),
          pendingAudits: Number(payload?.pendingAudits ?? 0),
        })
      } catch {
        // ignore overview errors; table still works
      }
    }
    loadOverview()
  }, [])

  useEffect(() => {
    async function loadOrgs() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("page", String(page))
        params.set("pageSize", String(pageSize))
        if (query) params.set("q", query)
        const res = await fetch(`/api/organizations?${params.toString()}`)
        if (!res.ok) throw new Error()
        const json = await res.json()
        const payload = json?.data ?? json
        const items = Array.isArray(payload?.items) ? payload.items : []
        setOrgs(items)
        setTotal(Number(payload?.total ?? 0))
      } catch (err) {
        setOrgs([])
        setTotal(0)
        toast({ variant: "destructive", title: "Error", description: "Could not load subscribers" })
      } finally {
        setLoading(false)
      }
    }
    loadOrgs()
  }, [toast, page, pageSize, query])

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-pink-600">SK's QuickData Admin</h1>
      <p className="text-blue-700 mt-2">Monitor the overall platform and manage all subscribers.</p>

      {overview && (
        <div className="mt-6 grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 animate-fade-in bg-gradient-to-br from-pink-100 via-white to-blue-200">
          {/* Subscribers Card */}
          <Card className="relative bg-gradient-to-br from-slate-100 via-white to-slate-200 border border-slate-200 shadow-md group transition-transform hover:scale-[1.025]">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-primary flex items-center gap-1">
                Subscribers
                <span className="ml-1"><Info className="h-3 w-3 text-muted-foreground" /></span>
              </CardTitle>
              <Badge variant="secondary">{overview.activeOrgs} active</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-accent-foreground">{overview.totalOrgs}</div>
              <p className="text-xs md:text-sm text-muted-foreground">Organizations onboarded</p>
              <Button size="sm" variant="outline" className="mt-2 w-full opacity-0 group-hover:opacity-100 transition-opacity">Add Subscriber</Button>
            </CardContent>
          </Card>
          {/* Orders Card */}
          <Card className="relative bg-gradient-to-br from-white via-slate-100 to-slate-200 border border-slate-200 shadow-md group transition-transform hover:scale-[1.025]">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-primary flex items-center gap-1">
                Orders
                <span className="ml-1"><Info className="h-3 w-3 text-muted-foreground" /></span>
              </CardTitle>
              <Badge variant="outline">All-time</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-accent-foreground">{overview.totalOrders}</div>
              <p className="text-xs md:text-sm text-muted-foreground">Across all subscribers</p>
              <Button size="sm" variant="outline" className="mt-2 w-full opacity-0 group-hover:opacity-100 transition-opacity">View Orders</Button>
            </CardContent>
          </Card>
          {/* Revenue Card */}
          <Card className="relative bg-gradient-to-br from-slate-100 via-white to-slate-200 border border-slate-200 shadow-md group transition-transform hover:scale-[1.025]">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-primary flex items-center gap-1">
                Revenue
                <span className="ml-1"><Info className="h-3 w-3 text-muted-foreground" /></span>
              </CardTitle>
              <Badge variant="secondary">GH₵</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-accent-foreground">{formatGhanaCedis(overview.totalRevenue)}</div>
              <p className="text-xs md:text-sm text-muted-foreground">Completed orders only</p>
              <Button size="sm" variant="outline" className="mt-2 w-full opacity-0 group-hover:opacity-100 transition-opacity">View Reports</Button>
            </CardContent>
          </Card>
          {/* Agents Card */}
          <Card className="relative bg-gradient-to-br from-white via-slate-100 to-slate-200 border border-slate-200 shadow-md group transition-transform hover:scale-[1.025]">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-primary flex items-center gap-1">
                Agents
                <span className="ml-1"><Info className="h-3 w-3 text-muted-foreground" /></span>
              </CardTitle>
              <Badge variant="outline">{overview.totalAgents} total</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-accent-foreground">{overview.totalAgents}</div>
              <p className="text-xs md:text-sm text-muted-foreground">Registered agents</p>
              <Button size="sm" variant="outline" className="mt-2 w-full opacity-0 group-hover:opacity-100 transition-opacity">Add Agent</Button>
            </CardContent>
          </Card>
          {/* Active Products Card */}
          <Card className="relative bg-gradient-to-br from-pink-100 via-white to-pink-200 border border-pink-200 shadow-md group transition-transform hover:scale-[1.025]">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-pink-700 flex items-center gap-1">
                Active Products
                <span className="ml-1"><Info className="h-3 w-3 text-pink-400" /></span>
              </CardTitle>
              <Badge variant="secondary">Live</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-pink-700">{overview.activeProducts ?? '—'}</div>
              <p className="text-xs md:text-sm text-muted-foreground">Products currently active</p>
              <Button size="sm" variant="outline" className="mt-2 w-full opacity-0 group-hover:opacity-100 transition-opacity">Add Product</Button>
            </CardContent>
          </Card>
          {/* Pending Audits Card */}
          <Card className="relative bg-gradient-to-br from-blue-100 via-white to-blue-200 border border-blue-200 shadow-md group transition-transform hover:scale-[1.025]">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-1">
                Pending Audits
                <span className="ml-1"><Info className="h-3 w-3 text-blue-400" /></span>
              </CardTitle>
              <Badge variant="outline">{overview.pendingAudits ?? '—'}</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-blue-700">{overview.pendingAudits ?? '—'}</div>
              <p className="text-xs md:text-sm text-muted-foreground">Audits needing review</p>
              <Button size="sm" variant="outline" className="mt-2 w-full opacity-0 group-hover:opacity-100 transition-opacity">Review Audits</Button>
            </CardContent>
          </Card>
          {/* Active Subscribers Card */}
          <Card className="relative bg-gradient-to-br from-green-100 via-white to-green-200 border border-green-200 shadow-md group transition-transform hover:scale-[1.025]">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-1">
                Active Subscribers
                <span className="ml-1"><Info className="h-3 w-3 text-green-400" /></span>
              </CardTitle>
              <Badge variant="secondary">Active</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-green-700">{overview.activeOrgs}</div>
              <p className="text-xs md:text-sm text-muted-foreground">Currently active</p>
              <Button size="sm" variant="outline" className="mt-2 w-full opacity-0 group-hover:opacity-100 transition-opacity">View Subscribers</Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Subscribers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center mb-4 gap-2">
              <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search subscribers" className="rounded border px-3 py-2 w-64" />
              <select value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value)); setPage(1) }} className="rounded border px-2 py-1">
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
              <div className="ml-auto text-sm text-muted-foreground">{total} results</div>
            </div>
            {safeOrgs.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-12">
                <svg width="64" height="64" fill="none" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#f3f4f6"/><path d="M20 44h24M32 20v16M24 28l8 8 8-8" stroke="#a3a3a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <p className="mt-4 text-muted-foreground text-sm">No subscribers found. Try adjusting your search or add a new subscriber.</p>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeOrgs.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-semibold">{o.name}</TableCell>
                    <TableCell>{o.slug}</TableCell>
                    <TableCell>{new Date(o.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{o.users.map((u) => u.email ?? u.role).join(", ")}</TableCell>
                    <TableCell>
                      {o.active ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(window.location.origin + "/store/" + o.slug)}>Open Store</Button>
                        <Button variant="outline" size="sm" onClick={() => openAuditsForAdmin(o.id, setAuditsLoading, setAudits, setSelectedOrg, setAuditsOpen)}>Audits</Button>
                        {o.active ? (
                          <Button size="sm" variant="destructive" onClick={async () => {
                            try {
                              const res = await fetch(`/api/organizations/${o.id}/deactivate`, { method: "POST" })
                              const json = await res.json()
                              const auditId = json?.auditId
                              setOrgs((prev) => prev.map((p) => p.id === o.id ? { ...p, active: false, activeProductsCount: 0 } : p))
                              const undoAction = auditId ? (<ToastAction altText="Undo deactivation" onClick={async () => {
                                try {
                                  const undoRes = await fetch(`/api/organizations/${o.id}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId }) })
                                  if (!undoRes.ok) throw new Error()
                                  setOrgs((prev) => prev.map((p) => p.id === o.id ? { ...p, active: true } : p))
                                  toast({ title: "Undo successful" })
                                } catch {
                                  toast({ variant: "destructive", title: "Undo failed" })
                                }
                              }}>Undo</ToastAction>) : undefined
                              toast({ title: "Organization deactivated", action: undoAction })
                            } catch {
                              toast({ variant: "destructive", title: "Error", description: "Could not deactivate" })
                            }
                          }}>Deactivate</Button>
                        ) : (
                          <Button size="sm" variant="default" onClick={async () => {
                            try {
                              const res = await fetch(`/api/organizations/${o.id}/activate`, { method: "POST" })
                              const json = await res.json()
                              const auditId = json?.auditId
                              setOrgs((prev) => prev.map((p) => p.id === o.id ? { ...p, active: true, activeProductsCount: 1 } : p))
                              const undoAction = auditId ? (<ToastAction altText="Undo activation" onClick={async () => {
                                try {
                                  const undoRes = await fetch(`/api/organizations/${o.id}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId }) })
                                  if (!undoRes.ok) throw new Error()
                                  setOrgs((prev) => prev.map((p) => p.id === o.id ? { ...p, active: false } : p))
                                  toast({ title: "Undo successful" })
                                } catch {
                                  toast({ variant: "destructive", title: "Undo failed" })
                                }
                              }}>Undo</ToastAction>) : undefined
                              toast({ title: "Organization activated", action: undoAction })
                            } catch {
                              toast({ variant: "destructive", title: "Error", description: "Could not activate" })
                            }
                          }}>Reactivate</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              <div className="flex items-center justify-between mt-4">
              <div>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <span className="mx-3">Page {page}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page * pageSize >= total}>Next</Button>
              </div>
              <div className="text-sm text-muted-foreground">Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total}</div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Dialog open={auditsOpen} onOpenChange={setAuditsOpen}>
              <DialogContent>
          <DialogHeader>
            <DialogTitle>Organization Audits</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {auditsLoading && <div>Loading...</div>}
            {!auditsLoading && audits.length === 0 && <div className="text-sm text-muted-foreground">No audits found.</div>}
              {!auditsLoading && audits.length > 0 && (
                <div className="max-h-96 overflow-auto">
                <div className="space-y-3">
                  {audits.map((a) => (
                    <div key={a.id} className="rounded border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{a.action}</div>
                          <div className="text-sm text-muted-foreground">By: {a.actorName ?? "System"} — {new Date(a.createdAt).toLocaleString()}</div>
                        </div>
                        <div>
                          {(a.action === "ACTIVATE_ORG" || a.action === "DEACTIVATE_ORG") && (
                            <Button size="sm" onClick={async () => {
                              try {
                                const res = await fetch(`/api/organizations/${selectedOrg}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditId: a.id }) })
                                if (!res.ok) throw new Error()
                                toast({ title: "Undo successful" })
                                setAudits((prev) => prev.filter((x) => x.id !== a.id))
                                setOrgs((prev) => prev.map((p) => p.id === selectedOrg ? { ...p, active: !p.active } : p))
                              } catch {
                                toast({ variant: "destructive", title: "Undo failed" })
                              }
                            }}>Undo</Button>
                          )}
                        </div>
                      </div>
                      {a.meta && (
                        <div className="mt-2 text-xs text-muted-foreground">{typeof a.meta === 'string' ? a.meta : JSON.stringify(a.meta)}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

async function openAuditsForAdmin(orgId: string, setAuditsLoading: (v: boolean) => void, setAudits: (v: any[]) => void, setSelectedOrg: (v: string | null) => void, setAuditsOpen: (v: boolean) => void) {
  setSelectedOrg(orgId)
  setAuditsOpen(true)
  setAuditsLoading(true)
  try {
    const res = await fetch(`/api/organizations/${orgId}/audits?page=1&pageSize=50`)
    if (!res.ok) throw new Error()
    const json = await res.json()
    setAudits(json.items || [])
  } catch (e) {
    // noop
  } finally {
    setAuditsLoading(false)
  }
}

