"use client";

import Link from "next/link";
import { useEffect, useState, ChangeEvent, FormEvent } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import { formatGhanaCedis } from "@/lib/currency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "manual_credit", label: "Manual Credit" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

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
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const { toast } = useToast();
  const [balance, setBalance] = useState(0);
  const [topups, setTopups] = useState<WalletTopup[]>([]);
  const [activities, setActivities] = useState<WalletActivity[]>([]);
  const [selfTopupAmount, setSelfTopupAmount] = useState("");
  const [savingSelfTopup, setSavingSelfTopup] = useState(false);
  const [beneficiaryEmail, setBeneficiaryEmail] = useState("");
  const [beneficiaryAmount, setBeneficiaryAmount] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [beneficiarySuggestions, setBeneficiarySuggestions] = useState<BeneficiarySuggestion[]>([]);
  const [searchingBeneficiaries, setSearchingBeneficiaries] = useState(false);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<BeneficiarySuggestion | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const tabParam =
    typeof searchParams?.tab === "string" ? searchParams.tab : "overview";
  const activeTab: TabValue =
    (TABS.find((t) => t.value === tabParam)?.value as TabValue) || "overview";

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
    <div className="space-y-4 px-4 py-6 md:p-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">Wallet</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          View your balance, recent top-ups, and usage. This is where you&#39;ll manage funds for buying data and other services.
        </p>
      </div>
      <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1 text-xs md:text-sm">
        {TABS.map((tab) => {
          const href =
            tab.value === "overview"
              ? "/dashboard/wallet"
              : `/dashboard/wallet?tab=${tab.value}`;
          const isActive = activeTab === tab.value;
          return (
            <Link
              key={tab.value}
              href={href}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <Card>
          <CardHeader>
            <CardTitle>Wallet Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div>
              <p>
                Current wallet balance: <span className="font-semibold">{formatGhanaCedis(balance)}</span>
              </p>
              {topups.length > 0 && (
                <div className="mt-2 text-[11px] space-y-1">
                  <p className="font-semibold text-foreground">Recent top ups</p>
                  {topups.slice(0, 5).map((t) => (
                    <p key={t.id} className="flex justify-between gap-2">
                      <span>
                        {t.method === "paystack" ? "Paystack" : "Manual"} · {t.beneficiaryEmail}
                      </span>
                      <span>{formatGhanaCedis(t.amount)}</span>
                    </p>
                  ))}
                </div>
              )}
              {topups.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No top ups yet. Once your wallet is funded, the transactions will appear here.
                </p>
              )}
            </div>

            <form
              className="space-y-2 text-xs"
              onSubmit={async (e: FormEvent) => {
                e.preventDefault();
                const amountNumber = Number(selfTopupAmount);
                if (!amountNumber || amountNumber <= 0) {
                  return toast({
                    variant: "destructive",
                    title: "Validation",
                    description: "Enter a valid amount to top up.",
                  });
                }

                setSavingSelfTopup(true);
                try {
                  const res = await fetch("/api/wallet/paystack/checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ amount: amountNumber, returnPath: "/dashboard/wallet" }),
                  });
                  const payload = await res.json().catch(() => null as any);
                  const authorizationUrl = payload?.data?.authorizationUrl ?? payload?.authorizationUrl;
                  const message = payload?.error?.message || payload?.message || "Could not start Paystack top up.";
                  if (!res.ok || !authorizationUrl) {
                    return toast({
                      variant: "destructive",
                      title: "Error",
                      description: message,
                    });
                  }

                  setSelfTopupAmount("");
                  window.location.href = authorizationUrl as string;
                } catch {
                  toast({
                    variant: "destructive",
                    title: "Network error",
                    description: "Could not reach Paystack service.",
                  });
                } finally {
                  setSavingSelfTopup(false);
                }
              }}
            >
              <p className="font-medium text-foreground">Top up via Paystack</p>
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <Input
                  type="number"
                  min={1}
                  step="0.01"
                  value={selfTopupAmount}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setSelfTopupAmount(e.target.value)}
                  placeholder="Amount in GH₵"
                  className="text-xs max-w-[180px]"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="text-xs"
                  disabled={savingSelfTopup}
                >
                  {savingSelfTopup ? "Redirecting..." : "Top up with Paystack"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                You will be redirected to Paystack to complete payment. Once successful, your wallet balance updates automatically.
              </p>
            </form>

            <div className="space-y-2 pt-2">
              <p className="font-medium text-foreground">Wallet overview</p>
              <p className="text-[11px] text-muted-foreground">
                Full wallet logs and activities, including Paystack top ups, manual credits, and debits.
              </p>
              {activities.length === 0 ? (
                <p className="text-xs text-muted-foreground">No wallet activity yet.</p>
              ) : (
                <div className="w-full max-w-full overflow-x-auto rounded-md border bg-background">
                  <Table className="min-w-[760px] text-xs">
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Date</TableHead>
                        <TableHead className="whitespace-nowrap">Method</TableHead>
                        <TableHead className="whitespace-nowrap">Status</TableHead>
                        <TableHead className="whitespace-nowrap">Performed By</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Amount (GH₵)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activities.map((activity) => (
                        <TableRow key={activity.id} className="hover:bg-muted/20">
                          <TableCell className="whitespace-nowrap">{new Date(activity.createdAt).toLocaleString()}</TableCell>
                          <TableCell className="uppercase">{activity.method}</TableCell>
                          <TableCell className="uppercase">{activity.status}</TableCell>
                          <TableCell>
                            {activity.performedByEmail || "System"}
                            {activity.performedByRole ? (
                              <span className="ml-1 text-[11px] text-muted-foreground">({activity.performedByRole})</span>
                            ) : null}
                          </TableCell>
                          <TableCell className={`whitespace-nowrap text-right font-semibold ${activity.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>
                            {formatGhanaCedis(activity.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "manual_credit" && (
        <Card>
          <CardHeader>
            <CardTitle>Manual Credit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs max-w-md">
            <p className="text-sm text-muted-foreground">
              Credit the wallet of any agent or reseller under your organization by email.
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
              className="space-y-3"
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
                  <div className="mt-1 rounded-md border bg-background text-[11px] max-h-40 overflow-auto">
                    {beneficiarySuggestions.map((s, idx) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`flex w-full items-center justify-between gap-2 px-2 py-1 text-left hover:bg-muted ${highlightedIndex === idx ? "bg-muted" : ""}`}
                        onClick={() => {
                          setBeneficiaryEmail(s.email);
                          setSelectedBeneficiary(s);
                          setBeneficiarySuggestions([]);
                          setHighlightedIndex(-1);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            {s.avatarUrl ? (
                              <img src={s.avatarUrl} alt={s.name || s.email} className="h-6 w-6 rounded-full" />
                            ) : (
                              <AvatarFallback>{s.name ? s.name[0] : s.email[0]}</AvatarFallback>
                            )}
                          </Avatar>
                          <span>
                            {s.email}
                            {s.name && <span className="ml-1 text-muted-foreground">({s.name})</span>}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
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
                  <p className="mt-1 text-[11px] text-muted-foreground">Searching agents and resellers…</p>
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
                <p className="text-xs font-medium text-muted-foreground">Amount (GH₵)</p>
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
      )}
    </div>
  );
}
