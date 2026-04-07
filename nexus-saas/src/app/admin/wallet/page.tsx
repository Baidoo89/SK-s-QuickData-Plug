"use client";

import { useState, ChangeEvent, FormEvent, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { formatGhanaCedis } from "@/lib/currency"

interface BeneficiarySuggestion {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  avatarUrl?: string | null;
  balance?: number | null;
}

interface WalletTransaction {
  id: string;
  user?: {
    id: string | null;
    name: string | null;
    email: string | null;
    role: string | null;
    avatarUrl: string | null;
  };
  amount: number;
  method: string;
  status: string;
  createdAt: string;
  performedByEmail: string | null;
  performedByRole: string | null;
}

  export default function AdminWalletPage() {
    const { toast } = useToast();
    const [beneficiaryEmail, setBeneficiaryEmail] = useState("");
    const [beneficiaryAmount, setBeneficiaryAmount] = useState("");
    const [savingManual, setSavingManual] = useState(false);
    const [beneficiarySuggestions, setBeneficiarySuggestions] = useState<BeneficiarySuggestion[]>([]);
    const [searchingBeneficiaries, setSearchingBeneficiaries] = useState(false);
    const [selectedBeneficiary, setSelectedBeneficiary] = useState<BeneficiarySuggestion | null>(null);
    const suggestionsRef = useRef<HTMLDivElement | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [txFilter, setTxFilter] = useState("");
    const [txType, setTxType] = useState("");
    const [txStatus, setTxStatus] = useState("");

    useEffect(() => {
      async function loadTransactions() {
        try {
          const params = new URLSearchParams();
          if (txFilter) params.set("q", txFilter);
          if (txType) params.set("method", txType);
          if (txStatus) params.set("status", txStatus);
          params.set("limit", "100");
          const res = await fetch(`/api/wallet/transactions?${params.toString()}`);
          if (!res.ok) return;
          const payload = (await res.json().catch(() => null)) as {
            results?: WalletTransaction[];
            data?: { results?: WalletTransaction[] };
          } | null;
          const results = payload?.data?.results ?? payload?.results;
          if (Array.isArray(results)) {
            setTransactions(results);
          }
        } catch {
          // ignore
        }
      }
      loadTransactions();
    }, [txFilter, txType, txStatus]);

    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Admin wallet</h1>
          <p className="text-sm text-muted-foreground">
            Monitor wallet activity across your agents and resellers, and apply manual credits when needed.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Wallet overview</CardTitle>
              <CardDescription className="text-xs">
                Platform wallet summary: total funded, payouts, manual credits, and recent activity across agents and resellers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
            {/* Summary metrics (mocked for now) */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex flex-col items-start bg-slate-100 rounded p-3 min-w-[120px]">
                <span className="text-xs text-muted-foreground">Total Funded</span>
                <span className="text-lg font-bold text-primary">{formatGhanaCedis(0)}</span>
              </div>
              <div className="flex flex-col items-start bg-slate-100 rounded p-3 min-w-[120px]">
                <span className="text-xs text-muted-foreground">Total Payouts</span>
                <span className="text-lg font-bold text-primary">{formatGhanaCedis(0)}</span>
              </div>
              <div className="flex flex-col items-start bg-slate-100 rounded p-3 min-w-[120px]">
                <span className="text-xs text-muted-foreground">Manual Credits</span>
                <span className="text-lg font-bold text-primary">{formatGhanaCedis(0)}</span>
              </div>
            </div>
            {/* Transaction history with filters/search */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Search user, type, or status</span>
                <Input
                  type="text"
                  value={txFilter}
                  onChange={e => setTxFilter(e.target.value)}
                  placeholder="Search by user, email, type, status..."
                  className="text-xs w-64"
                />
              </div>
              <div className="flex gap-2">
                <select value={txType} onChange={e => setTxType(e.target.value)} className="rounded border px-2 py-1 text-xs">
                  <option value="">All Methods</option>
                  <option value="manual">Manual</option>
                  <option value="paystack">Paystack</option>
                </select>
                <select value={txStatus} onChange={e => setTxStatus(e.target.value)} className="rounded border px-2 py-1 text-xs">
                  <option value="">All Statuses</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
            <div className="mt-2">
              <Table className="min-w-[320px] text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">No transactions found.</TableCell>
                    </TableRow>
                  )}
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            {tx.user?.avatarUrl ? (
                              <img src={tx.user.avatarUrl} alt={tx.user.name || tx.user.email || "User"} className="h-5 w-5 rounded-full" />
                            ) : (
                              <AvatarFallback>{tx.user?.name?.[0] || tx.user?.email?.[0] || "U"}</AvatarFallback>
                            )}
                          </Avatar>
                          <span>
                            {tx.user?.name || tx.user?.email || "Unknown"}
                            {tx.user?.role ? (
                              <span className="ml-1 text-[10px] uppercase text-muted-foreground">{tx.user.role}</span>
                            ) : null}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="uppercase">{tx.method}</TableCell>
                      <TableCell className="uppercase">{tx.status}</TableCell>
                      <TableCell>{new Date(tx.createdAt).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{formatGhanaCedis(tx.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Manual credit</CardTitle>
            <CardDescription className="text-xs">
              Search by email or name and post a manual credit directly into a user wallet within your organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
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
            className="space-y-3 max-w-md"
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
                  if (beneficiarySuggestions.length > 0) {
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
                  }
                }}
                placeholder="email or name"
                className="text-xs"
              />
              {beneficiarySuggestions.length > 0 && (
                <div ref={suggestionsRef} className="mt-1 rounded-md border bg-background text-[11px] max-h-40 overflow-auto">
                  {beneficiarySuggestions.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`flex w-full items-center gap-2 justify-between px-2 py-1 text-left hover:bg-muted ${highlightedIndex === idx ? 'bg-muted' : ''}`}
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
                        <span>{s.email}</span>
                        {s.name && <span className="ml-1 text-muted-foreground">({s.name})</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        {s.role && (
                          <span className="uppercase text-[10px] text-muted-foreground">{s.role}</span>
                        )}
                        {typeof s.balance === 'number' && (
                          <span className="text-xs font-semibold text-green-700">{formatGhanaCedis(s.balance)}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchingBeneficiaries && beneficiaryEmail.trim().length >= 2 && beneficiarySuggestions.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">Searching users in your organization…</p>
              )}
              {!searchingBeneficiaries && beneficiaryEmail.trim().length >= 2 && beneficiarySuggestions.length === 0 && !selectedBeneficiary && (
                <p className="mt-1 text-[11px] text-muted-foreground">No matching users found.</p>
              )}
              {selectedBeneficiary && (
                <div className="mt-2 flex items-center gap-2 text-xs bg-muted/40 rounded px-2 py-1">
                  <Avatar className="h-6 w-6">
                    {selectedBeneficiary.avatarUrl ? (
                      <img src={selectedBeneficiary.avatarUrl} alt={selectedBeneficiary.name || selectedBeneficiary.email} className="h-6 w-6 rounded-full" />
                    ) : (
                      <AvatarFallback>{selectedBeneficiary.name ? selectedBeneficiary.name[0] : selectedBeneficiary.email[0]}</AvatarFallback>
                    )}
                  </Avatar>
                  <span>{selectedBeneficiary.email}</span>
                  {selectedBeneficiary.name && <span className="ml-1 text-muted-foreground">({selectedBeneficiary.name})</span>}
                  {selectedBeneficiary.role && <span className="uppercase text-[10px] text-muted-foreground">{selectedBeneficiary.role}</span>}
                  {typeof selectedBeneficiary.balance === 'number' && <span className="text-xs font-semibold text-green-700">Balance: {formatGhanaCedis(selectedBeneficiary.balance)}</span>}
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
              disabled={savingManual || !beneficiaryEmail.trim()}
              className="w-full sm:w-auto text-xs"
            >
              {savingManual ? "Confirming..." : selectedBeneficiary ? `Credit ${selectedBeneficiary.name || selectedBeneficiary.email}` : "Confirm manual credit"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              This will record a manual credit on the agent or reseller wallet. In production it should also be logged in your audit trail.
            </p>
          </form>
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
