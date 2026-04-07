"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Reseller {
  id: string
  name: string | null
  email: string | null
  active?: boolean
  parentAgentId?: string | null
  isOwnedByCurrentAgent?: boolean
  profit?: number
  createdAt: string
}

export default function AgentResellersPage() {
  const { toast } = useToast()
  const [resellers, setResellers] = useState<Reseller[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [lastInvite, setLastInvite] = useState<string | null>(null)
  const [lastInviteEmailSent, setLastInviteEmailSent] = useState<boolean | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedReseller, setSelectedReseller] = useState<Reseller | null>(null)
  const [editName, setEditName] = useState("")

  const loadResellers = async () => {
    try {
      const res = await fetch(`/api/resellers?t=${Date.now()}`, { cache: "no-store" })
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null)
        const message = errorPayload?.error?.message || errorPayload?.message || "Could not load resellers"
        const code = errorPayload?.error?.code
        const reason = errorPayload?.error?.details?.reason
        const fullMessage = [message, code ? `[${code}]` : null, reason ? `- ${reason}` : null]
          .filter(Boolean)
          .join(" ")
        toast({ variant: "destructive", title: "Error", description: fullMessage })
        console.error("[RESELLERS_LOAD_FAILED]", errorPayload)
        return
      }
      const payload = await res.json()
      const data: Reseller[] = Array.isArray(payload?.data) ? payload.data : []
      setResellers(data)
    } catch {
      // ignore for now
    } finally {
      setInitialLoading(false)
    }
  }

  useEffect(() => {
    loadResellers()
  }, [])

  const createReseller = async () => {
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()

    if (trimmedName.length < 2) {
      return toast({
        variant: "destructive",
        title: "Validation",
        description: "Reseller name must be at least 2 characters.",
      })
    }
    if (!trimmedEmail) {
      return toast({
        variant: "destructive",
        title: "Validation",
        description: "Email is required.",
      })
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      return toast({
        variant: "destructive",
        title: "Validation",
        description: "Enter a valid email address.",
      })
    }

    setLoading(true)
    try {
      const res = await fetch("/api/resellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, email: trimmedEmail }),
      })
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null)
        const rawText = !errorPayload ? await res.text().catch(() => "") : ""
        const message = errorPayload?.error?.message || errorPayload?.message || rawText || "Failed to create reseller"
        const code = errorPayload?.error?.code
        const reason = errorPayload?.error?.details?.reason
        const fullMessage = [message, code ? `[${code}]` : null, reason ? `- ${reason}` : null]
          .filter(Boolean)
          .join(" ")
        console.error("[RESELLERS_CREATE_FAILED]", errorPayload)
        throw new Error(fullMessage || "Failed to create reseller")
      }
      const payload = await res.json()
      const data = (payload?.data || payload) as { user?: Reseller; inviteUrl?: string; emailSent?: boolean }
      setName("")
      setEmail("")
      setLastInvite(data?.inviteUrl ?? null)
      setLastInviteEmailSent(typeof data?.emailSent === "boolean" ? data.emailSent : null)
      if (data?.user) {
        setResellers((prev) => {
          const withoutExisting = prev.filter((r) => r.id !== data.user!.id)
          return [data.user!, ...withoutExisting]
        })
      }
      await loadResellers()
      if (data?.inviteUrl) {
        try {
          await navigator.clipboard.writeText(data.inviteUrl)
          toast({
            title: "Reseller created",
            description:
              data?.emailSent === false
                ? "Email not sent. Invite link copied to clipboard."
                : "Invite link copied to clipboard.",
          })
        } catch {
          toast({
            title: "Reseller created",
            description:
              data?.emailSent === false
                ? "Email not sent. Copy the invite link shown below and send it."
                : "Copy the invite link shown below and send it.",
          })
        }
      } else {
        toast({
          title: "Reseller created",
          description:
            data?.emailSent === false
              ? "Email not sent. Please create again to generate a new invite link."
              : undefined,
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "Could not create reseller",
      })
    } finally {
      setLoading(false)
    }
  }

  const openEdit = (reseller: Reseller) => {
    setSelectedReseller(reseller)
    setEditName(reseller.name || "")
    setEditModalOpen(true)
  }

  const saveEdit = async () => {
    if (!selectedReseller) return
    if (editName.trim().length < 2) {
      toast({ variant: "destructive", title: "Validation", description: "Name must be at least 2 characters." })
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/resellers/${selectedReseller.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      })
      if (!res.ok) throw new Error("Could not update reseller")
      const payload = await res.json()
      const updated = payload?.data
      setResellers((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
      setEditModalOpen(false)
      toast({ title: "Reseller updated" })
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not update reseller" })
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (reseller: Reseller) => {
    setLoading(true)
    try {
      const nextActive = reseller.active === false
      const res = await fetch(`/api/resellers/${reseller.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      })
      if (!res.ok) throw new Error("Could not update reseller")
      const payload = await res.json()
      const updated = payload?.data
      setResellers((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
      toast({ title: nextActive ? "Reseller activated" : "Reseller deactivated" })
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not update reseller status" })
    } finally {
      setLoading(false)
    }
  }

  const confirmDelete = (reseller: Reseller) => {
    setSelectedReseller(reseller)
    setDeleteModalOpen(true)
  }

  const deleteReseller = async () => {
    if (!selectedReseller) return
    setLoading(true)
    try {
      const res = await fetch(`/api/resellers/${selectedReseller.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Could not delete reseller")
      setResellers((prev) => prev.filter((r) => r.id !== selectedReseller.id))
      setDeleteModalOpen(false)
      toast({ title: "Reseller deleted" })
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not delete reseller" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Resellers</h1>
        <p className="text-sm text-muted-foreground">
          Invite resellers under your organization and share secure login links with them.
        </p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Add new reseller</CardTitle>
          <CardDescription className="text-xs">
            Enter the reseller&apos;s name and email. We&apos;ll generate a secure invite link for them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              placeholder="Reseller name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              type="email"
              name="email"
              placeholder="reseller@example.com"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button
            onClick={createReseller}
            disabled={loading}
            className="w-full"
          >
            {loading ? "Creating reseller..." : "Create & copy invite"}
          </Button>
          {lastInvite && (
            <div className="rounded border border-sky-200 bg-sky-50 p-3 text-xs space-y-2">
              <p className="font-medium text-sky-900">Latest invite link</p>
              <p className="break-all text-sky-800">{lastInvite}</p>
              {lastInviteEmailSent === false && (
                <p className="text-amber-700">
                  Email delivery failed. Share this link manually with the reseller.
                </p>
              )}
              {lastInviteEmailSent === true && (
                <p className="text-emerald-700">
                  Invitation email sent successfully.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(lastInvite)
                      toast({ title: "Invite copied" })
                    } catch {
                      toast({ variant: "destructive", title: "Copy failed", description: "Could not copy invite link" })
                    }
                  }}
                >
                  Copy link
                </Button>
                <Button asChild type="button" variant="outline" size="sm" className="h-7 text-[11px]">
                  <a href={lastInvite} target="_blank" rel="noreferrer">Open link</a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Your resellers</CardTitle>
          <CardDescription className="text-xs">
            Manage your reseller accounts and pricing access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialLoading && (
            <p className="text-sm text-muted-foreground">Loading resellers...</p>
          )}
          {!initialLoading && resellers.length === 0 && (
            <p className="text-sm text-muted-foreground">No resellers yet. Add your first reseller above.</p>
          )}
          {!initialLoading && resellers.length > 0 && (
            <div className="space-y-3 text-xs">
              {resellers.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border bg-background px-3 py-3 shadow-sm"
                >
                  {r.isOwnedByCurrentAgent === false && (
                    <p className="mb-2 text-[11px] font-medium text-amber-700">
                      Managed by another agent. View only.
                    </p>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2 sm:block">
                        <p className="truncate text-sm font-semibold">{r.name || "Unnamed reseller"}</p>
                        <span
                          className={[
                            "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold sm:mt-1",
                            r.active === false ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700",
                          ].join(" ")}
                        >
                          {r.active === false ? "Inactive" : "Active"}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{r.email}</p>
                      <p className="text-[11px] font-medium text-emerald-700">
                        Profit: GH₵ {(r.profit ?? 0).toFixed(2)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Added {new Date(r.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                      {r.isOwnedByCurrentAgent !== false ? (
                        <>
                          <Button asChild variant="outline" size="sm" className="h-8 w-full text-[11px] sm:w-auto">
                            <Link href={`/agent/resellers/${r.id}`}>Pricing</Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full text-[11px] sm:w-auto"
                            onClick={() => openEdit(r)}
                            disabled={loading}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full text-[11px] sm:w-auto"
                            onClick={() => toggleActive(r)}
                            disabled={loading}
                          >
                            {r.active === false ? "Activate" : "Deactivate"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 w-full text-[11px] sm:w-auto"
                            onClick={() => confirmDelete(r)}
                            disabled={loading}
                          >
                            Delete
                          </Button>
                        </>
                      ) : (
                        <Button asChild variant="outline" size="sm" className="h-8 w-full text-[11px] sm:w-auto sm:col-span-2">
                          <Link href={`/agent/resellers/${r.id}`}>View pricing</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit reseller</DialogTitle>
            <DialogDescription>Update the reseller display name.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Reseller name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={loading}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete reseller</DialogTitle>
            <DialogDescription>
              This will permanently remove {selectedReseller?.name || "this reseller"}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteReseller} disabled={loading}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
