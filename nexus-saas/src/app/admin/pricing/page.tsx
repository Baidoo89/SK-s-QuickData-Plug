"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatGhanaCedis } from "@/lib/currency";

type ProviderFilter = "ALL" | "MTN" | "AIRTELTIGO" | "TELECEL";

interface BasePricingRow {
  productId: string;
  name: string;
  provider: string;
  defaultPrice: number;
  basePrice: number;
}

interface AgentPricingSummaryRow {
  id: string;
  name: string | null;
  email: string | null;
  overrides: number;
}

export default function AdminPricingPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<BasePricingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("ALL");
  const [search, setSearch] = useState("");
  const [agentSummary, setAgentSummary] = useState<AgentPricingSummaryRow[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/pricing/base");
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as BasePricingRow[];
        setRows(data);
      } catch {
        // ignore for now
      } finally {
        setLoading(false);
      }
    }
    async function loadAgents() {
      setLoadingAgents(true);
      try {
        const res = await fetch("/api/pricing/agent/summary");
        if (!res.ok) return;
        const data = (await res.json()) as AgentPricingSummaryRow[];
        setAgentSummary(data);
      } catch {
        // ignore
      } finally {
        setLoadingAgents(false);
      }
    }

    load();
    loadAgents();
  }, []);

  const filteredRows = rows.filter((row) =>
    (providerFilter === "ALL" ? true : row.provider === providerFilter) &&
    (search.trim() === "" ? true : row.name.toLowerCase().includes(search.trim().toLowerCase()))
  );

  async function saveBasePrice(productId: string, price: number) {
    if (price < 0 || !Number.isFinite(price)) return;
    setSavingId(productId);
    try {
      const res = await fetch("/api/pricing/base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, price }),
      });
      if (!res.ok) {
        const text = await res.text();
        return toast({
          variant: "destructive",
          title: "Failed to save price",
          description: text || "Something went wrong while saving.",
        });
      }
      setRows((current) =>
        current.map((row) =>
          row.productId === productId ? { ...row, basePrice: price } : row
        )
      );
      toast({ title: "Base price updated", description: "New pricing will flow through to agents and storefronts." });
    } catch {
      toast({
        variant: "destructive",
        title: "Network error",
        description: "Could not reach pricing service.",
      });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Pricing</h2>
        <p className="text-sm text-muted-foreground">
          Manage bundle pricing and network-level pricing in one place. <span className="font-semibold text-primary">Easily update, filter, and review pricing for all products and agents.</span>
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-slate-100 via-white to-slate-200 border border-slate-200 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Bundle pricing</CardTitle>
            <CardDescription className="text-xs">
              Default prices for each bundle used by your storefront and agents.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p>Update bundle prices to control what customers and agents see by default.</p>
            <p>Agent-specific overrides remain under Agents &amp; Resellers.</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-100 via-white to-blue-200 border border-blue-200 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Network pricing</CardTitle>
            <CardDescription className="text-xs">
              Focus pricing by network when updating many bundles.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs">
            {["ALL", "MTN", "AIRTELTIGO", "TELECEL"].map((value) => {
              const v = value as ProviderFilter;
              const isActive = providerFilter === v;
              return (
                <Button
                  key={v}
                  type="button"
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className={`text-[11px] ${isActive ? "bg-blue-600 text-white" : ""}`}
                  onClick={() => setProviderFilter(v)}
                >
                  {v === "ALL" ? "All networks" : v}
                </Button>
              );
            })}
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-100 via-white to-green-200 border border-green-200 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Status</CardTitle>
            <CardDescription className="text-xs">Overview of your pricing data.</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p>
              Products loaded: <span className="font-semibold">{rows.length}</span>
            </p>
            <p>
              Showing: <span className="font-semibold">{filteredRows.length}</span> {providerFilter === "ALL" ? "total" : providerFilter.toLowerCase()} bundles
            </p>
          </CardContent>
        </Card>
              <Card className="bg-gradient-to-br from-pink-100 via-white to-pink-200 border border-pink-200 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Search & Filter</CardTitle>
                  <CardDescription className="text-xs">Quickly find bundles by name.</CardDescription>
                </CardHeader>
                <CardContent className="text-xs">
                  <Input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search bundle name..."
                    className="text-xs"
                  />
                </CardContent>
              </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Bundle pricing table</CardTitle>
          <CardDescription className="text-xs">
            Edit the default GH₵ price for each bundle. Agent-specific pricing overrides are configured per agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto text-xs">
          {loading && (
            <p className="text-muted-foreground">Loading pricing…</p>
          )}
          {!loading && filteredRows.length === 0 && (
            <p className="text-muted-foreground">No products found. Add products in the Products section first.</p>
          )}
          {!loading && filteredRows.length > 0 && (
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size (GB)</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Default price</TableHead>
                  <TableHead>Base price</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  // Extract GB size from name (e.g., '5GB')
                  let size = "";
                  const match = row.name.match(/(\d+)GB/i);
                  if (match) size = match[1];
                  return (
                    <TableRow key={row.productId} className="hover:bg-slate-50 transition">
                      <TableCell className="font-medium text-primary">{row.name}</TableCell>
                      <TableCell>{size}</TableCell>
                      <TableCell className="uppercase text-[11px]">
                        <span className={`px-2 py-1 rounded bg-${row.provider === "MTN" ? "yellow-200" : row.provider === "AIRTELTIGO" ? "blue-200" : "red-200"} text-xs font-semibold`}>{row.provider}</span>
                      </TableCell>
                      <TableCell>{formatGhanaCedis(row.defaultPrice)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={row.basePrice}
                          onBlur={(e: ChangeEvent<HTMLInputElement>) => {
                            const val = parseFloat(e.target.value);
                            if (Number.isNaN(val)) return;
                            if (val === row.basePrice) return;
                            saveBasePrice(row.productId, val);
                          }}
                          className="h-8 text-xs border-green-300"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={savingId === row.productId}
                          className="text-[11px]"
                          onClick={() => saveBasePrice(row.productId, row.basePrice)}
                        >
                          {savingId === row.productId ? "Saving…" : "Save"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Agent pricing overview</CardTitle>
          <CardDescription className="text-xs">
            See which agents are using base pricing and which have special bundle prices.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto text-xs">
          {loadingAgents && (
            <p className="text-muted-foreground">Loading agent data…</p>
          )}
          {!loadingAgents && agentSummary.length === 0 && (
            <p className="text-muted-foreground">No agents found yet. Invite agents first to see their pricing status.</p>
          )}
          {!loadingAgents && agentSummary.length > 0 && (
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Pricing overrides</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentSummary.map((agent) => (
                  <TableRow key={agent.id} className="hover:bg-slate-50 transition">
                    <TableCell className="font-medium flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback>{agent.name ? agent.name[0] : "A"}</AvatarFallback>
                      </Avatar>
                      {agent.name || "Unnamed agent"}
                    </TableCell>
                    <TableCell>{agent.email || "-"}</TableCell>
                    <TableCell className="text-right">
                      {agent.overrides === 0 ? (
                        <span className="text-muted-foreground">Uses base pricing</span>
                      ) : (
                        <span className="font-semibold text-pink-700">{agent.overrides} override{agent.overrides === 1 ? "" : "s"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
