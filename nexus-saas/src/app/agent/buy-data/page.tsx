"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle } from "lucide-react";

function formatGhanaCedis(value: number): string {
  return `GH₵ ${value.toFixed(2)}`;
}

export default function AgentBuyDataPage() {
  const { toast } = useToast();

  // Single Buy Tab State
  const [phone, setPhone] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [networks, setNetworks] = useState<{ id: string; name: string }[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [bundles, setBundles] = useState<any[]>([]);
  const [selectedBundle, setSelectedBundle] = useState("");
  const [loadingBundles, setLoadingBundles] = useState(false);
  const [buying, setBuying] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any>(null);

  // Bulk Buy Tab State
  const [bulkInput, setBulkInput] = useState("");
  const [bulkBuying, setBulkBuying] = useState(false);
  const [bulkResults, setBulkResults] = useState<any[]>([]);

  // Load networks on mount
  useEffect(() => {
    async function loadNetworks() {
      try {
        const res = await fetch("/api/networks");
        if (!res.ok) return;
        const data = await res.json();
        setNetworks(data);
        if (data.length > 0) {
          setSelectedNetwork(data[0].id);
        }
      } catch (error) {
        console.error("Failed to load networks:", error);
      }
    }
    loadNetworks();
  }, []);

  // Load bundles when network changes
  useEffect(() => {
    async function loadBundles() {
      if (!selectedNetwork) {
        setBundles([]);
        return;
      }
      setLoadingBundles(true);
      try {
        const res = await fetch(
          `/api/bundles?networkId=${encodeURIComponent(selectedNetwork)}`
        );
        if (!res.ok) return;
        let data = await res.json();

        // Sort by size
        data = data.sort((a: any, b: any) => {
          function parseSize(s: string) {
            const match = s.match(/(\d+(?:\.\d+)?)(GB|MB)/i);
            if (!match) return 0;
            let val = parseFloat(match[1]);
            if (match[2].toUpperCase() === "GB") return val * 1000;
            return val;
          }
          return parseSize(a.name) - parseSize(b.name);
        });

        setBundles(data);
        setSelectedBundle(data.length > 0 ? data[0].id : "");
      } catch (error) {
        console.error("Failed to load bundles:", error);
      } finally {
        setLoadingBundles(false);
      }
    }
    loadBundles();
  }, [selectedNetwork]);

  // Get selected bundle details
  const selectedBundleObj = bundles.find((b) => b.id === selectedBundle);
  const totalCost = selectedBundleObj ? selectedBundleObj.effectivePrice * quantity : 0;
  const selectedNetworkObj = networks.find((n) => n.id === selectedNetwork);

  // Single Buy Handler
  async function handleSingleBuy(e: React.FormEvent) {
    e.preventDefault();
    if (!phone || !selectedBundle || quantity < 1) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setBuying(true);
    setOrderSuccess(null);
    try {
      const res = await fetch("/api/agent/buy-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          bundleId: selectedBundle,
          quantity,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Purchase failed");
      }

      const data = await res.json();
      const order = data.data;

      setOrderSuccess(order);
      setPhone("");
      setQuantity(1);

      toast({
        title: "Success",
        description: `Order ${order.orderId} created!`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Could not complete purchase",
        variant: "destructive",
      });
    } finally {
      setBuying(false);
    }
  }

  // Bulk Buy Handler
  async function handleBulkBuy(e: React.FormEvent) {
    e.preventDefault();
    if (!bulkInput.trim()) {
      toast({
        title: "Error",
        description: "Please paste CSV or JSON data",
        variant: "destructive",
      });
      return;
    }

    setBulkBuying(true);
    setBulkResults([]);

    try {
      let items: any[] = [];

      // Try parsing as JSON first
      if (bulkInput.trim().startsWith("[")) {
        items = JSON.parse(bulkInput);
      } else {
        // Parse CSV
        const lines = bulkInput.trim().split("\n");
        const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
        items = lines.slice(1).map((line) => {
          const values = line.split(",").map((v) => v.trim());
          const item: any = {};
          header.forEach((h, i) => {
            item[h] = isNaN(Number(values[i])) ? values[i] : Number(values[i]);
          });
          return item;
        });
      }

      const results = [];

      for (const item of items) {
        try {
          const res = await fetch("/api/agent/buy-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phone: item.phone,
              bundleId: item.bundleId,
              quantity: item.quantity || 1,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            results.push({ ...item, status: "SUCCESS", orderId: data.data.orderId });
          } else {
            const error = await res.json();
            results.push({ ...item, status: "ERROR", error: error.message });
          }
        } catch (error) {
          results.push({
            ...item,
            status: "ERROR",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      setBulkResults(results);

      const successCount = results.filter((r) => r.status === "SUCCESS").length;
      toast({
        title: "Bulk Complete",
        description: `${successCount}/${results.length} orders created`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid CSV/JSON format",
        variant: "destructive",
      });
    } finally {
      setBulkBuying(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 md:p-8">
      <Tabs defaultValue="single" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="single">Single Buy</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Buy</TabsTrigger>
        </TabsList>

        {/* Single Buy Tab */}
        <TabsContent value="single" className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Single Purchase</CardTitle>
              <CardDescription className="text-xs">
                Choose a network, pick a bundle, and confirm the recipient phone number.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSingleBuy}>
                {/* Network Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Network Filter <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {networks.map((n) => {
                      const active = selectedNetwork === n.id;
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => setSelectedNetwork(n.id)}
                          className={[
                            "rounded-full px-3 py-1 text-xs font-semibold transition",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80",
                          ].join(" ")}
                        >
                          {n.name}
                        </button>
                      );
                    })}
                  </div>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                    value={selectedNetwork}
                    onChange={(e) => setSelectedNetwork(e.target.value)}
                    disabled={networks.length === 0}
                  >
                    {networks.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Showing bundles for {selectedNetworkObj?.name || "selected network"}
                  </p>
                </div>

                {/* Bundle Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Bundle <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                    value={selectedBundle}
                    onChange={(e) => setSelectedBundle(e.target.value)}
                    disabled={loadingBundles || bundles.length === 0}
                  >
                    {bundles.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name.replace(/Bundle/i, "").trim()} –{" "}
                        {formatGhanaCedis(b.effectivePrice)}
                      </option>
                    ))}
                  </select>
                  {bundles.length === 0 && !loadingBundles && selectedNetwork && (
                    <p className="text-xs text-yellow-600">No bundles available for this network</p>
                  )}
                </div>

                {/* Quantity */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="text-xs"
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+233501234567"
                    className="text-xs"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </div>

                {/* Cost Preview */}
                {selectedBundleObj && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>Price per unit:</span>
                      <span className="font-medium">
                        {formatGhanaCedis(selectedBundleObj.effectivePrice)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Quantity:</span>
                      <span className="font-medium">{quantity}</span>
                    </div>
                    <div className="border-t border-blue-200 pt-2 flex justify-between text-sm font-bold">
                      <span>Total Cost:</span>
                      <span className="text-blue-600">{formatGhanaCedis(totalCost)}</span>
                    </div>
                  </div>
                )}

                {/* Buy Button */}
                <Button
                  type="submit"
                  disabled={buying || !selectedBundle || quantity < 1 || !phone}
                  className="w-full text-xs"
                >
                  {buying ? "Processing..." : "Complete Purchase"}
                </Button>
              </form>

              {/* Success Message */}
              {orderSuccess && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-600">Order Created!</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Order ID:</span>
                      <span className="font-mono font-semibold">{orderSuccess.orderId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bundle:</span>
                      <span>{orderSuccess.bundle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone:</span>
                      <span>{orderSuccess.phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total:</span>
                      <span className="font-semibold">
                        {formatGhanaCedis(orderSuccess.total)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs">
                        {orderSuccess.status}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bulk Buy Tab */}
        <TabsContent value="bulk" className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Bulk Purchase</CardTitle>
              <CardDescription className="text-xs">
                Paste CSV or JSON and the app will create the orders one by one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleBulkBuy}>
                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
                  <p className="text-xs font-medium text-blue-900">Format: CSV or JSON</p>
                  <p className="text-xs text-blue-800">
                    <strong>CSV:</strong> phone,bundleId,quantity
                  </p>
                  <p className="text-xs text-blue-800">
                    <strong>Example:</strong>
                  </p>
                  <code className="text-xs block bg-blue-100 p-2 rounded font-mono">
                    {`phone,bundleId,quantity
+233501234567,abc123,1
+233501234568,def456,2`}
                  </code>
                </div>

                {/* Input Area */}
                <textarea
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder="Paste CSV or JSON data here..."
                  className="w-full h-36 rounded-md border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
                />

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={bulkBuying || !bulkInput.trim()}
                  className="w-full text-xs"
                >
                  {bulkBuying ? "Processing..." : "Create Orders"}
                </Button>
              </form>

              {/* Results Table */}
              {bulkResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  <h3 className="text-xs font-semibold">Results</h3>
                  <div className="space-y-2 md:hidden">
                    {bulkResults.map((result, idx) => (
                      <div key={idx} className="rounded-lg border bg-background p-3 shadow-sm text-xs">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{result.phone}</p>
                            <p className="text-[11px] text-muted-foreground">{result.bundleId}</p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              result.status === "SUCCESS"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {result.status}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">Qty</span>
                          <span className="font-medium">{result.quantity || 1}</span>
                        </div>
                        <div className="mt-1 break-words text-[11px] text-muted-foreground">
                          {result.status === "SUCCESS" ? result.orderId : result.error}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border text-left p-2">Phone</th>
                          <th className="border text-left p-2">Bundle ID</th>
                          <th className="border text-center p-2">Qty</th>
                          <th className="border text-center p-2">Status</th>
                          <th className="border text-left p-2">Order ID / Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkResults.map((result, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="border p-2">{result.phone}</td>
                            <td className="border p-2 font-mono text-xs">
                              {result.bundleId}
                            </td>
                            <td className="border p-2 text-center">{result.quantity || 1}</td>
                            <td className="border p-2 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  result.status === "SUCCESS"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {result.status}
                              </span>
                            </td>
                            <td className="border p-2 font-mono text-xs">
                              {result.status === "SUCCESS"
                                ? result.orderId
                                : result.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
