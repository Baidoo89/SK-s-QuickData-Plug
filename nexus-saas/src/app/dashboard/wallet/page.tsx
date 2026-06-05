"use client";

import { useEffect, useState, ChangeEvent, FormEvent, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import { formatGhanaCedis } from "@/lib/currency";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, ArrowRightLeft, Banknote, UserPlus, WalletCards } from "lucide-react";

interface BeneficiarySuggestion {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  avatarUrl?: string | null;
  balance?: number | null;
}

interface WalletTopup {
  id: string;
  createdAt: string;
  method: "paystack" | "manual";
  performedByEmail: string | null;
  performedByRole: string | null;
  beneficiaryEmail: string;
  amount: number;
  status: "success";
}

interface WalletActivity {
  id: string;
  createdAt: string;
  method: string;
  status: string;
  amount: number;
  performedByEmail: string | null;
  performedByRole: string | null;
}

export default function WalletPage({
}: {
  searchParams?: never;
}) {
  const { toast } = useToast();
  const [balance, setBalance] = useState(0);
  const [topups, setTopups] = useState<WalletTopup[]>([]);
  const [activities, setActivities] = useState<WalletActivity[]>([]);
  const [beneficiaryEmail, setBeneficiaryEmail] = useState("");
  const [beneficiaryAmount, setBeneficiaryAmount] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [beneficiarySuggestions, setBeneficiarySuggestions] = useState<BeneficiarySuggestion[]>([]);
  const [searchingBeneficiaries, setSearchingBeneficiaries] = useState(false);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<BeneficiarySuggestion | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);

  function statusBadgeClass(status: string) {
    if (status === "success") return "status-success border";
    if (status === "pending") return "status-warning border";
    if (status === "failed") return "";
    return "status-info border";
  }

  useEffect(() => {
    async function loadWallet() {
      try {
        const res = await fetch("/api/agent/wallet");
        if (!res.ok) return;
        const payload = (await res.json()) as {
          balance?: number;
          topups?: WalletTopup[];
          data?: { balance?: number; topups?: WalletTopup[] };
        };
        const walletData = payload?.data ?? payload;
        if (typeof walletData.balance === "number") setBalance(walletData.balance);
        if (Array.isArray(walletData.topups)) setTopups(walletData.topups);
      } catch {
        // ignore
      }
    }
    loadWallet();
  }, []);

  useEffect(() => {
    async function loadActivities() {
      try {
        const res = await fetch("/api/wallet/transactions?limit=100");
        if (!res.ok) return;
        const payload = (await res.json().catch(() => null)) as {
          results?: WalletActivity[];
          data?: { results?: WalletActivity[] };
        } | null;
        const results = payload?.data?.results ?? payload?.results;
        if (Array.isArray(results)) {
          setActivities(results);
        }
      } catch {
        // ignore
      }
    }
    loadActivities();
  }, []);
  return (
    <div className="portal-page space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">Wallet</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Fund operational wallets for agents and resellers, then review wallet movements across your organization.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Operational Wallet"
          value={formatGhanaCedis(balance)}
          description="Balance for wallet-backed VTU operations."
          icon={WalletCards}
          tone="success"
        />
        <MetricCard
          label="Manual Credits"
          value={topups.length}
          description="Recent successful funding records loaded."
          icon={UserPlus}
          tone="primary"
        />
        <MetricCard
          label="Activity"
          value={activities.length}
          description="Recent wallet movements in this organization."
          icon={Activity}
          tone="info"
        />
        <MetricCard
          label="Withdrawals"
          value="Profit only"
          description="Payout requests come from earned profit, not wallet top-ups."
          icon={Banknote}
          tone="primary"
        />
      </div>

      <Card className="overflow-hidden border border-border bg-card/95 shadow-sm">
        <CardContent className="grid min-w-0 gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Wallet vs withdrawals</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Wallet balance is used to pay for VTU/order operations. Withdrawals are based on seller profit earned from completed orders.
            </p>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
            <span className="rounded-md border bg-background px-3 py-1 text-center text-xs text-muted-foreground">Wallet funds orders</span>
            <span className="rounded-md border bg-background px-3 py-1 text-center text-xs text-muted-foreground">Profit funds payouts</span>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border border-border bg-card/95 shadow-sm">
        <CardHeader className="border-b bg-muted/30 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            Manual Wallet Top Up
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 text-xs">
          <p className="text-sm text-muted-foreground">
            Credit an agent or reseller wallet under your organization by email.
          </p>
          <form
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              const amountNumber = Number(beneficiaryAmount);
              if (!beneficiaryEmail.trim() || !amountNumber || amountNumber <= 0) {
                return toast({
                  variant: "destructive",
                  title: "Validation",
                  description: "Enter a beneficiary email and a valid amount.",
                });
              }
              setSavingManual(true);
              try {
                const res = await fetch("/api/agent/wallet", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    method: "manual",
                    beneficiaryEmail: beneficiaryEmail.trim(),
                    amount: amountNumber,
                  }),
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                  const message = data?.message || "Manual credit failed.";
                  return toast({ variant: "destructive", title: "Error", description: message });
                }
                setBeneficiaryEmail("");
                setBeneficiaryAmount("");
                setBeneficiarySuggestions([]);
                setSelectedBeneficiary(null);
                setHighlightedIndex(-1);
                toast({ title: "Manual credit recorded", description: "The credit has been applied to the selected wallet." });
              } catch {
                toast({
                  variant: "destructive",
                  title: "Network error",
                  description: "Could not reach wallet service.",
                });
              } finally {
                setSavingManual(false);
              }
            }}
            className="max-w-xl min-w-0 space-y-3"
          >
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Beneficiary email</p>
              <Input
                type="email"
                name="beneficiaryEmail"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={beneficiaryEmail}
                onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                  const value = e.target.value;
                  setBeneficiaryEmail(value);
                  setBeneficiarySuggestions([]);
                  setSelectedBeneficiary(null);
                  setHighlightedIndex(-1);
                  const trimmed = value.trim();
                  if (trimmed.length < 2) return;
                  setSearchingBeneficiaries(true);
                  try {
                    const res = await fetch(`/api/agent/wallet/beneficiaries?q=${encodeURIComponent(trimmed)}`);
                    if (!res.ok) return;
                    const payload = (await res.json().catch(() => null)) as {
                      results?: BeneficiarySuggestion[];
                      data?: { results?: BeneficiarySuggestion[] };
                    } | null;
                    const results = payload?.data?.results ?? payload?.results;
                    if (Array.isArray(results)) {
                      setBeneficiarySuggestions(results);
                    }
                  } catch {
                    // ignore search errors
                  } finally {
                    setSearchingBeneficiaries(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (beneficiarySuggestions.length === 0) return;

                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlightedIndex((prev) => Math.min(prev + 1, beneficiarySuggestions.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlightedIndex((prev) => Math.max(prev - 1, 0));
                  } else if (e.key === "Enter" && highlightedIndex >= 0) {
                    e.preventDefault();
                    const selected = beneficiarySuggestions[highlightedIndex];
                    setBeneficiaryEmail(selected.email);
                    setSelectedBeneficiary(selected);
                    setBeneficiarySuggestions([]);
                    setHighlightedIndex(-1);
                  }
                }}
                placeholder="agent-or-reseller@example.com"
                className="text-xs"
              />
              {beneficiarySuggestions.length > 0 && (
                <div ref={suggestionsRef} className="mt-1 max-h-40 min-w-0 overflow-auto rounded-md border bg-background text-[11px]">
                  {beneficiarySuggestions.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`flex w-full min-w-0 items-center justify-between gap-2 px-2 py-1 text-left hover:bg-muted ${highlightedIndex === idx ? "bg-muted" : ""}`}
                      onClick={() => {
                        setBeneficiaryEmail(s.email);
                        setSelectedBeneficiary(s);
                        setBeneficiarySuggestions([]);
                        setHighlightedIndex(-1);
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar className="h-6 w-6">
                          {s.avatarUrl ? (
                            <img src={s.avatarUrl} alt={s.name || s.email} className="h-6 w-6 rounded-full" />
                          ) : (
                            <AvatarFallback>{s.name ? s.name[0] : s.email[0]}</AvatarFallback>
                          )}
                        </Avatar>
                        <span className="min-w-0 truncate">
                          {s.email}
                          {s.name && <span className="ml-1 text-muted-foreground">({s.name})</span>}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {s.role && (
                          <span className="uppercase text-[10px] text-muted-foreground">{s.role}</span>
                        )}
                        {typeof s.balance === "number" && (
                          <span className="text-[11px] font-semibold text-foreground">{formatGhanaCedis(s.balance)}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchingBeneficiaries && beneficiaryEmail.trim().length >= 2 && beneficiarySuggestions.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">Searching agents and resellers...</p>
              )}
              {!searchingBeneficiaries && beneficiaryEmail.trim().length >= 2 && beneficiarySuggestions.length === 0 && !selectedBeneficiary && (
                <p className="mt-1 text-[11px] text-muted-foreground">No matching users found.</p>
              )}
              {selectedBeneficiary && (
                <div className="mt-2 flex items-center gap-2 rounded border bg-muted/40 px-2 py-1">
                  <Avatar className="h-6 w-6">
                    {selectedBeneficiary.avatarUrl ? (
                      <img src={selectedBeneficiary.avatarUrl} alt={selectedBeneficiary.name || selectedBeneficiary.email} className="h-6 w-6 rounded-full" />
                    ) : (
                      <AvatarFallback>
                        {selectedBeneficiary.name ? selectedBeneficiary.name[0] : selectedBeneficiary.email[0]}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <span className="truncate">{selectedBeneficiary.email}</span>
                  {selectedBeneficiary.role && (
                    <span className="uppercase text-[10px] text-muted-foreground">{selectedBeneficiary.role}</span>
                  )}
                  {typeof selectedBeneficiary.balance === "number" && (
                    <span className="ml-auto text-[11px] font-semibold">{formatGhanaCedis(selectedBeneficiary.balance)}</span>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Amount (GHS)</p>
              <Input
                type="number"
                min={1}
                value={beneficiaryAmount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBeneficiaryAmount(e.target.value)}
                placeholder="e.g. 100"
                className="text-xs"
              />
            </div>
            <Button
              type="submit"
              disabled={savingManual}
              className="w-full sm:w-auto text-xs"
            >
              {savingManual ? "Confirming..." : "Confirm manual credit"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              This records a manual credit on the selected agent or reseller wallet.
            </p>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border border-border bg-card/95 shadow-sm">
        <CardHeader className="border-b bg-muted/30 pb-3">
          <CardTitle className="text-sm font-semibold">Wallet Records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
          <p className="text-[11px] text-muted-foreground">
            Wallet logs and activities, including manual top-ups and debits.
          </p>
          {activities.length === 0 ? (
            <EmptyState
              icon={WalletCards}
              title="No wallet activity yet"
              description="Manual credits, reseller funding, and order debits will appear here after the first wallet movement in your organization."
              secondaryAction={{ label: "Add Agents", href: "/dashboard/agents" }}
              className="py-6"
            />
          ) : (
            <>
            <div className="grid gap-3 xl:hidden lg:grid-cols-2">
              {activities.map((activity) => (
                <div key={activity.id} className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium uppercase text-foreground">{activity.method}</p>
                      <p className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</p>
                    </div>
                    <Badge
                      variant={activity.status === "success" ? "secondary" : activity.status === "failed" ? "destructive" : "outline"}
                      className={statusBadgeClass(activity.status)}
                    >
                      {activity.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <p className={`font-semibold ${activity.amount < 0 ? "text-destructive" : "text-success"}`}>
                        {formatGhanaCedis(activity.amount)}
                      </p>
                      <p>Amount</p>
                    </div>
                    <div>
                      <p className="truncate font-medium text-foreground">{activity.performedByEmail || "System"}</p>
                      <p>{activity.performedByRole || "Performer"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="table-scroll hidden rounded-md border bg-background xl:block">
              <Table className="min-w-[760px] text-xs">
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead className="whitespace-nowrap">Method</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Performed By</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Amount (GHS)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((activity) => (
                    <TableRow key={activity.id} className="hover:bg-muted/20">
                      <TableCell className="whitespace-nowrap">{new Date(activity.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="uppercase">{activity.method}</TableCell>
                      <TableCell>
                        <Badge
                          variant={activity.status === "success" ? "secondary" : activity.status === "failed" ? "destructive" : "outline"}
                          className={statusBadgeClass(activity.status)}
                        >
                          {activity.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {activity.performedByEmail || "System"}
                        {activity.performedByRole ? (
                          <span className="ml-1 text-[11px] text-muted-foreground">({activity.performedByRole})</span>
                        ) : null}
                      </TableCell>
                      <TableCell className={`whitespace-nowrap text-right font-semibold ${activity.amount < 0 ? "text-destructive" : "text-success"}`}>
                        {formatGhanaCedis(activity.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
