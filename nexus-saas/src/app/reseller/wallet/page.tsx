"use client";

import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { formatGhanaCedis } from "@/lib/currency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    <div className="flex flex-1 flex-col items-center">
      <div className="w-full max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Wallet</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            View your current reseller wallet balance and recent top ups. Your agent or admin can credit this wallet manually, or you can top up via Paystack.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Wallet overview</CardTitle>
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
            <p className="font-medium text-foreground">Top up via Paystack</p>
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
              <Input
                type="number"
                min={1}
                step="0.01"
                value={topupAmount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTopupAmount(e.target.value)}
                placeholder="Amount in GH₵"
                className="text-xs max-w-[180px]"
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

          <div className="space-y-2 pt-2">
            <p className="font-medium text-foreground">Wallet overview</p>
            <p className="text-[11px] text-muted-foreground">
              All wallet logs and activities, including Paystack top ups, manual credits, and debits.
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
      </div>
    </div>
  );
}