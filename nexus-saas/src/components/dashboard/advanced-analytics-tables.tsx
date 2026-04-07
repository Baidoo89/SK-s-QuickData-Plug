"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatGhanaCedis } from "@/lib/currency";

type NetworkRow = {
  provider: string;
  value: number;
};

type SimpleRow = {
  name: string;
  revenue: number;
  orders: number;
};

interface AdvancedAnalyticsTablesProps {
  networkRows: NetworkRow[];
  topAgents: SimpleRow[];
  topProducts: SimpleRow[];
}

export function AdvancedAnalyticsTables({
  networkRows,
  topAgents,
  topProducts,
}: AdvancedAnalyticsTablesProps) {
  const [search, setSearch] = React.useState("");

  const normalizedSearch = search.trim().toLowerCase();

  const filteredNetworks = React.useMemo(() => {
    if (!normalizedSearch) return networkRows;
    return networkRows.filter((row) =>
      row.provider.toLowerCase().includes(normalizedSearch)
    );
  }, [networkRows, normalizedSearch]);

  const filteredAgents = React.useMemo(() => {
    if (!normalizedSearch) return topAgents;
    return topAgents.filter((agent) =>
      agent.name.toLowerCase().includes(normalizedSearch)
    );
  }, [topAgents, normalizedSearch]);

  const filteredProducts = React.useMemo(() => {
    if (!normalizedSearch) return topProducts;
    return topProducts.filter((product) =>
      product.name.toLowerCase().includes(normalizedSearch)
    );
  }, [topProducts, normalizedSearch]);

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Filter analytics by network, agent, or product name.
        </p>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search networks, agents, products..."
          className="w-full sm:w-72"
        />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-7 mt-4">
        <Card className="col-span-1 lg:col-span-3 bg-gradient-to-br from-slate-100 via-white to-slate-200">
          <CardHeader>
            <CardTitle>Network performance</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Revenue by provider in the selected period.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[320px] text-xs md:text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-primary">Network</TableHead>
                  <TableHead className="text-right text-primary">Revenue (GH₵)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNetworks.map((row) => (
                  <TableRow key={row.provider}>
                    <TableCell className="font-medium">{row.provider}</TableCell>
                    <TableCell className="text-right">{formatGhanaCedis(row.value)}</TableCell>
                  </TableRow>
                ))}
                {filteredNetworks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-xs text-muted-foreground">
                      No networks match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="col-span-1 lg:col-span-4 bg-gradient-to-br from-white via-slate-100 to-slate-200">
          <CardHeader>
            <CardTitle>Top agents</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[320px] text-xs md:text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-primary">Agent</TableHead>
                  <TableHead className="text-right text-primary">Revenue (GH₵)</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.map((agent) => (
                  <TableRow key={agent.name}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell className="text-right">{formatGhanaCedis(agent.revenue)}</TableCell>
                    <TableCell className="text-right">{agent.orders}</TableCell>
                  </TableRow>
                ))}
                {filteredAgents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                      No agents match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-7 mt-4">
        <Card className="col-span-1 lg:col-span-4 bg-gradient-to-br from-slate-100 via-white to-slate-200">
          <CardHeader>
            <CardTitle>Top products</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[320px] text-xs md:text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-primary">Product</TableHead>
                  <TableHead className="text-right text-primary">Revenue (GH₵)</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.name}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-right">{formatGhanaCedis(product.revenue)}</TableCell>
                    <TableCell className="text-right">{product.orders}</TableCell>
                  </TableRow>
                ))}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                      No products match your search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
