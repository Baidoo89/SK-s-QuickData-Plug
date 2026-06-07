"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Copy, Plus, Trash } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

interface ApiKey {
  id: string
  name: string
  key: string
  createdAt: Date
  lastUsed: Date | null
  ownerType?: string | null
}

interface ApiKeysProps {
  apiKeys: ApiKey[]
}

export function ApiKeys({ apiKeys }: ApiKeysProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const onCopy = (key: string) => {
    navigator.clipboard.writeText(key)
    toast({
      title: "Copied",
      description: "API key copied to clipboard",
    })
  }

  const onDelete = async (id: string) => {
    try {
      setIsLoading(true)
      await fetch(`/api/api-keys?id=${id}`, {
        method: "DELETE",
      })
      router.refresh()
      toast({
        title: "Success",
        description: "API key deleted",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get("name")

    try {
      await fetch("/api/api-keys", {
        method: "POST",
        body: JSON.stringify({ name }),
      })
      setOpen(false)
      router.refresh()
      toast({
        title: "Success",
        description: "API key created",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="premium-surface min-w-0 overflow-hidden rounded-lg">
      <CardHeader className="border-b border-border/70 bg-muted/20 pb-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">API Keys</CardTitle>
            <CardDescription className="break-words text-xs">
              Manage credentials for external sites that submit paid orders into your fulfillment flow.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Create New Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={onSubmit}>
                <DialogHeader>
                  <DialogTitle>Create API Key</DialogTitle>
                  <DialogDescription>
                    Give your key a name to identify it later.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" placeholder="e.g. Production" required />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Creating..." : "Create Key"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid gap-3 md:hidden">
          {apiKeys.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No API keys found.</p>
          ) : (
            apiKeys.map((apiKey) => (
              <div key={apiKey.id} className="min-w-0 rounded-lg border border-border/70 bg-background/80 p-3 text-sm shadow-sm">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{apiKey.name}</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {apiKey.key.slice(0, 8)}...{apiKey.key.slice(-4)}
                    </p>
                    <Badge variant="outline" className="mt-2 rounded-md px-2 py-0 text-[10px]">
                      {apiKey.ownerType || "SUBSCRIBER"}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{new Date(apiKey.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onCopy(apiKey.key)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(apiKey.id)} disabled={isLoading}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="ops-table-surface table-scroll hidden rounded-lg md:block">
          <Table className="min-w-[620px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell className="font-medium">{apiKey.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-md px-2 py-0 text-[10px]">
                      {apiKey.ownerType || "SUBSCRIBER"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {apiKey.key.slice(0, 8)}...{apiKey.key.slice(-4)}
                  </TableCell>
                  <TableCell>
                    {new Date(apiKey.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onCopy(apiKey.key)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(apiKey.id)}
                        disabled={isLoading}
                      >
                        <Trash className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {apiKeys.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No API keys found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
