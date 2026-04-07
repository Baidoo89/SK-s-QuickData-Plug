import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";

export default function AgentOrdersTable({ agentId }: { agentId: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {                               
      setLoading(true);
      try {
        const res = await fetch(`/api/orders?role=agent&id=${agentId}`);
        if (!res.ok) throw new Error("Failed to load orders");
        setOrders(await res.json());
      } catch {
        setOrders([]);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, [agentId]);

  return (
    <Card className="shadow-sm border">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl font-semibold">Recent Orders</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-muted-foreground">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="text-muted-foreground">No orders found for this agent.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border text-xs md:text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border px-3 py-2 text-left font-semibold">Order ID</th>
                  <th className="border px-3 py-2 text-left font-semibold">Amount</th>
                  <th className="border px-3 py-2 text-left font-semibold">Status</th>
                  <th className="border px-3 py-2 text-left font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 10).map((order) => (
                  <tr key={order.id}>
                    <td className="border px-3 py-2 font-mono">{order.id}</td>
                    <td className="border px-3 py-2">₵{order.total?.toFixed(2) ?? '-'}</td>
                    <td className="border px-3 py-2">{order.status}</td>
                    <td className="border px-3 py-2">{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
