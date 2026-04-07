"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { Users, ChevronRight } from "lucide-react"
import { formatGhanaCedis } from "@/lib/currency"

interface Agent {
  id: string
  name: string
  createdAt: string
  active?: boolean
  totalOrders?: number
  totalRevenue?: number
  totalProfit?: number
  estimatedCommission?: number
  commissionPercent?: number
}

type ApiDataWrapper<T> = {
  data?: T
}

function extractApiData<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as ApiDataWrapper<T>).data as T
  }

  return payload as T
}

function normalizeArrayResponse<T>(payload: unknown): T[] {
  const data = extractApiData<T[] | T>(payload)
  return Array.isArray(data) ? data : []
}

export default function AgentsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [newAgentName, setNewAgentName] = useState("")
  const [newAgentEmail, setNewAgentEmail] = useState("")
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [editNameInput, setEditNameInput] = useState("")
  const [editCommissionInput, setEditCommissionInput] = useState<string>("")

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")

  const selectedAgent = useMemo(() => agents.find((a) => a.id === selectedAgentId) || null, [agents, selectedAgentId])

  const aggregateStats = useMemo(() => {
    const totalAgents = agents.length
    const activeAgents = agents.filter((a) => a.active !== false).length
    const totalOrders = agents.reduce((sum, a) => sum + (a.totalOrders ?? 0), 0)
    const totalRevenue = agents.reduce((sum, a) => sum + (a.totalRevenue ?? 0), 0)
    return { totalAgents, activeAgents, totalOrders, totalRevenue }
  }, [agents])

  useEffect(() => {
    async function load() {
      try {
        const agentsRes = await fetch("/api/agents")
        if (!agentsRes.ok) {
          toast({ variant: "destructive", title: "Error", description: "Failed to load agents" })
          return
        }
        const agentsData = normalizeArrayResponse<Agent>(await agentsRes.json())
        setAgents(agentsData)
        if (agentsData.length > 0) setSelectedAgentId(agentsData[0].id)
      } finally {
        setInitialLoading(false)
      }
    }
    load()
  }, [toast])

  const createAgent = async () => {
    const trimmed = newAgentName.trim()
    if (trimmed.length < 2) {
      toast({
        variant: "destructive",
        title: "Validation",
        description: "Agent name must be at least 2 characters.",
      })
      return
    }
    const emailTrimmed = newAgentEmail.trim()
    if (!emailTrimmed) {
      toast({
        variant: "destructive",
        title: "Validation",
        description: "Agent email is required.",
      })
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailTrimmed)) {
      toast({
        variant: "destructive",
        title: "Validation",
        description: "Enter a valid email address.",
      })
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, email: emailTrimmed }),
      })
      if (!res.ok) {
        const message = await res.text()
        throw new Error(message || "Failed to create agent")
      }
      const data = await res.json()
      const responseData = data.data || data
      const agent = responseData.agent
      setAgents((prev) => [agent, ...prev])
      setSelectedAgentId(agent.id)
      setNewAgentName("")
      setNewAgentEmail("")
      if (responseData.inviteUrl) {
        setLastInviteLink(responseData.inviteUrl)
        try {
          await navigator.clipboard.writeText(responseData.inviteUrl)
          toast({ title: "Agent created", description: "Invite link copied to clipboard." })
        } catch {
          toast({ title: "Agent created", description: "Copy the invite link shown below and send to the agent." })
        }
      } else {
        toast({ title: "Agent created" })
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not create agent"
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleAgentActive = async (agent: Agent) => {
    const nextActive = agent.active !== false
    const newActive = !nextActive
    setLoading(true)
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: agent.name, active: newActive }),
      })
      if (!res.ok) throw new Error()
      const updated = extractApiData<Agent>(await res.json())
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)))
      toast({ title: newActive ? "Agent activated" : "Agent deactivated" })
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not update agent status" })
    } finally {
      setLoading(false)
    }
  }

  const filteredAgents = useMemo(() => {
    const term = search.toLowerCase().trim()
    return agents.filter((agent) => {
      if (term && !agent.name.toLowerCase().includes(term)) return false
      if (statusFilter === "active" && agent.active === false) return false
      if (statusFilter === "inactive" && agent.active !== false) return false
      return true
    })
  }, [agents, search, statusFilter])

  const copyInviteLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: "Invite link copied" })
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Copy the link manually from the page." })
    }
  }

  return (
    <div className="flex-1 space-y-6 px-4 py-6 md:p-8 md:pt-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Agents</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl">
            Onboard agents, send them a one-time password setup link, share storefront links for their customers, and control their commission and prices from one place.
          </p>
        </div>
        <Card className="w-full max-w-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Add new agent</CardTitle>
            <CardDescription className="text-xs">
              We&apos;ll generate a secure invite link the agent uses once to set a password. After that they log in via your normal login page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                id="agentName"
                placeholder="Agent name"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
              />
              <Input
                type="email"
                name="agentEmail"
                placeholder="agent@example.com"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={newAgentEmail}
                onChange={(e) => setNewAgentEmail(e.target.value)}
              />
            </div>
            <Button
              onClick={createAgent}
              disabled={loading}
              className="w-full"
            >
              {loading ? "Creating agent..." : "Create & copy invite"}
            </Button>
            {lastInviteLink && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-medium text-primary">Password setup link</p>
                <p className="text-[11px] text-muted-foreground break-all">{lastInviteLink}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => copyInviteLink(lastInviteLink)}>
                    Copy link
                  </Button>
                  <Button type="button" size="sm" variant="secondary" asChild>
                    <a href={lastInviteLink} target="_blank" rel="noreferrer">Open link</a>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">The email is still sent through Resend when configured, but the link is always shown here for quick access.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* High-level agent overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total agents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{aggregateStats.totalAgents}</p>
            <p className="mt-1 text-xs text-muted-foreground">Across your VTU business.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active agents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{aggregateStats.activeAgents}</p>
            <p className="mt-1 text-xs text-muted-foreground">Currently allowed to sell.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{aggregateStats.totalOrders}</p>
            <p className="mt-1 text-xs text-muted-foreground">Completed orders from all agents.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatGhanaCedis(aggregateStats.totalRevenue)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Gross VTU revenue driven by agents.</p>
          </CardContent>
        </Card>
      </div>

      {/* Main layout: left = agents & stats, right = pricing */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-2 border-b bg-muted/40">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold">Agents</CardTitle>
                <CardDescription className="text-xs">
                  Tap an agent to view full details and pricing.
                </CardDescription>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                {agents.length} total
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
              <Input
                placeholder="Search agents by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs md:max-w-xs"
              />
              <div className="flex gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={[
                    "rounded-full px-3 py-1",
                    statusFilter === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("active")}
                  className={[
                    "rounded-full px-3 py-1",
                    statusFilter === "active"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("inactive")}
                  className={[
                    "rounded-full px-3 py-1",
                    statusFilter === "inactive"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  Inactive
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {initialLoading && (
              <div className="space-y-2">
                <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
                <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
                <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
              </div>
            )}
            {!initialLoading && agents.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No agents yet. Create your first agent above.
              </p>
            )}
            {!initialLoading && agents.length > 0 && (
              <div className="space-y-3">
                {filteredAgents.length === 0 && (
                  <p className="text-xs text-muted-foreground">No agents match your filters.</p>
                )}
                {filteredAgents.map((agent) => {
                  const isActive = agent.active !== false
                  const orders = agent.totalOrders ?? 0
                  const revenue = agent.totalRevenue ?? 0
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background/70 px-3 py-3 text-left text-xs transition-colors hover:bg-muted/80"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{agent.name}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {orders} orders · {formatGhanaCedis(revenue)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-600",
                          ].join(" ")}
                        >
                          {isActive ? "Active" : "Inactive"}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Pricing overrides</CardTitle>
            <CardDescription className="text-xs">
              Manage overrides from an agent&apos;s detail page where the network-specific table is easier to review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              This page is for onboarding, status, and agent selection. Use the detail view to edit prices per network.
            </p>
            {selectedAgentId ? (
              <Button type="button" variant="outline" onClick={() => router.push(`/dashboard/agents/${selectedAgentId}`)}>
                Open selected agent
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Select an agent first to open their detail page.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Agent Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
            <DialogDescription>Update the agent's display name and commission.</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              value={editNameInput}
              onChange={(e) => setEditNameInput(e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
            <label className="block text-sm font-medium mb-2 mt-4">Commission (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={editCommissionInput}
              onChange={(e) => setEditCommissionInput(e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </div>
          <DialogFooter>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!selectedAgentId) return
                  const newName = editNameInput.trim()
                  if (!newName) {
                    return toast({
                      variant: "destructive",
                      title: "Validation",
                      description: "Name is required",
                    })
                  }
                  const commissionRaw = editCommissionInput.trim()
                  const commissionVal = commissionRaw ? Number(commissionRaw) : 0
                  if (Number.isNaN(commissionVal) || commissionVal < 0 || commissionVal > 100) {
                    return toast({
                      variant: "destructive",
                      title: "Validation",
                      description: "Commission must be between 0 and 100.",
                    })
                  }
                  setLoading(true)
                  try {
                    const res = await fetch(`/api/agents/${selectedAgentId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newName, commissionPercent: commissionVal }),
                    })
                    if (!res.ok) throw new Error()
                    const updated = extractApiData<Agent>(await res.json())
                    setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
                    setEditModalOpen(false)
                    toast({ title: "Agent updated" })
                  } catch {
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: "Could not update agent",
                    })
                  } finally {
                    setLoading(false)
                  }
                }}
              >
                Save
              </Button>
            </div>
          </DialogFooter>
          <DialogClose />
        </DialogContent>
      </Dialog>

      {/* Delete Agent Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              Confirm deletion of this agent. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <p>
              Are you sure you want to delete <strong>{selectedAgent?.name}</strong>?
            </p>
          </div>
          <DialogFooter>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!selectedAgentId) return
                  setLoading(true)
                  try {
                    const res = await fetch(`/api/agents/${selectedAgentId}`, { method: "DELETE" })
                    if (!res.ok) throw new Error()
                    setAgents((prev) => {
                      const updated = prev.filter((a) => a.id !== selectedAgentId)
                      setSelectedAgentId(updated[0]?.id ?? null)
                      return updated
                    })
                    setDeleteModalOpen(false)
                    toast({ title: "Agent deleted" })
                  } catch {
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: "Could not delete agent",
                    })
                  } finally {
                    setLoading(false)
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </DialogFooter>
          <DialogClose />
        </DialogContent>
      </Dialog>
    </div>
  )
}
