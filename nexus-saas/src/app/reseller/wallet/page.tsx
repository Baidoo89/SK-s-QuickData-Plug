"use client";

import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { useToast } from "@/components/ui/use-toast";
import { formatGhanaCedis } from "@/lib/currency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, CreditCard, WalletCards } from "lucide-react";

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

export default function ResellerWalletPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [balance, setBalance] = useState(0);
  const [topups, setTopups] = useState<WalletTopup[]>([]);
  const [activities, setActivities] = useState<WalletActivity[]>([]);
  const [topupAmount, setTopupAmount] = useState("");
  const [savingTopup, setSavingTopup] = useState(false);

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
        const res = await fetch("/api/wallet/transactions?scope=self&limit=100");
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

  useEffect(() => {
    const status = searchParams.get("walletTopup");
    if (!status) return;

    if (status === "success") {
      toast({ title: "Top up successful", description: "Your reseller wallet has been credited." });
      return;
    }

    if (status === "failed") {
      toast({ variant: "destructive", title: "Top up failed", description: "Paystack verification failed. Please try again." });
    }
  }, [searchParams, toast]);

  return (
    <div className="portal-page space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Wallet</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            View your current reseller wallet balance and recent top-ups. Your agent can credit this wallet manually, or you can top up via Paystack.
          </p>
        </div>

        <div className="grid min-w-0 gap-4 md:grid-cols-3">
          <MetricCard
            label="Wallet Balance"
            value={formatGhanaCedis(balance)}
            description="Available balance for reseller VTU orders."
            icon={WalletCards}
            tone="success"
          />
          <MetricCard
            label="Top Ups"
            value={topups.length}
            description="Recent funding records."
            icon={CreditCard}
            tone="primary"
          />
          <MetricCard
            label="Activity"
            value={activities.length}
            description="Wallet credits, debits, and adjustments."
            icon={Activity}
            tone="info"
          />
        </div>

        <Card id="top-up">
          <CardHeader>
            <CardTitle>Wallet Top Up</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div>
            <p>
              Current wallet balance: <span className="font-semibold">{formatGhanaCedis(balance)}</span>
            </p>
            {topups.length > 0 && (
                <div className="mt-2 space-y-2 text-[11px]">
                  <p className="font-semibold text-foreground">Recent Top-Ups</p>
                  {topups.slice(0, 5).map((t) => (
                  <p key={t.id} className="flex flex-col gap-1 rounded-md border bg-background px-2 py-1 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      {t.method === "paystack" ? "Paystack" : "Manual"} | {t.beneficiaryEmail}
                    </span>
                    <span className="font-medium text-foreground">{formatGhanaCedis(t.amount)}</span>
                  </p>
                ))}
              </div>
            )}
            {topups.length === 0 && (
              <EmptyState
                icon={WalletCards}
                title="No top-ups yet"
                description="Top up with Paystack or ask your agent to credit your wallet manually. Funding records will appear here."
                secondaryAction={{ label: "Buy Data", href: "/reseller/buy/single" }}
                className="mt-3 py-5"
              />
            )}
          </div>

          <form
            className="space-y-2 text-xs"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              const amountNumber = Number(topupAmount);
              if (!amountNumber || amountNumber <= 0) {
                return toast({
                  variant: "destructive",
                  title: "Validation",
                  description: "Enter a valid amount to top up.",
                });
              }

              setSavingTopup(true);
              try {
                const res = await fetch("/api/wallet/paystack/checkout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ amount: amountNumber, returnPath: "/reseller/wallet" }),
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

                setTopupAmount("");
                window.location.href = authorizationUrl as string;
              } catch {
                toast({
                  variant: "destructive",
                  title: "Network error",
                  description: "Could not reach Paystack service.",
                });
              } finally {
                setSavingTopup(false);
              }
            }}
          >
            <p className="font-medium text-foreground">Top Up via Paystack</p>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <Input
                type="number"
                min={1}
                step="0.01"
                value={topupAmount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTopupAmount(e.target.value)}
                placeholder="Amount in GHS"
                className="text-xs"
              />
              <Button
                type="submit"
                size="sm"
                className="text-xs"
                disabled={savingTopup}
              >
                {savingTopup ? "Redirecting..." : "Top up with Paystack"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              You will be redirected to Paystack to complete payment. Once successful, your reseller wallet balance updates automatically.
            </p>
          </form>

          <div id="transactions" className="space-y-2 pt-2">
            <p className="font-medium text-foreground">Transactions</p>
            <p className="text-[11px] text-muted-foreground">
              All wallet logs and activities, including Paystack top-ups, manual credits, and debits.
            </p>
            {activities.length === 0 ? (
              <EmptyState
                icon={WalletCards}
                title="No wallet activity yet"
                description="Paystack top-ups, manual credits, and order debits will appear here after your first wallet movement."
                className="py-6"
              />
            ) : (
              <div className="table-scroll rounded-md border bg-background">
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
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
