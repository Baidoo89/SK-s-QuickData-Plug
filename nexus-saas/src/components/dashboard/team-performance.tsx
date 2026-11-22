"use client"

import { useState } from "react"
import Link from "next/link"
import { CalendarDays, ChevronDown, Trophy } from "lucide-react"

import { formatGhanaCedis } from "@/lib/currency"
import { Card } from "@/components/ui/card"

export type TeamPerformanceRow = {
  id: string
  name: string
  role: "AGENT" | "RESELLER"
  href: string
  profit: number
  orders: number
  revenue: number
  active: boolean
}

export type DailyTeamPerformance = {
  date: string
  label: string
  rows: TeamPerformanceRow[]
}

export function TeamPerformance({ days }: { days: DailyTeamPerformance[] }) {
  const [selectedDate, setSelectedDate] = useState(days[days.length - 1]?.date ?? "")
  const selectedDay = days.find((day) => day.date === selectedDate) ?? days[days.length - 1]
  const rows = selectedDay?.rows ?? []

  return (
    <Card className="premium-surface overflow-hidden rounded-lg">
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <Trophy className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Team performance</span>
              <span className="block truncate text-xs text-muted-foreground">Daily completed profit, highest first</span>
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform [details[open]_&]:rotate-180" />
        </summary>
        <div className="p-3 sm:p-4">
          <div className="mb-4 flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            {days.map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${selectedDay?.date === day.date ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-background text-muted-foreground hover:bg-muted"}`}
                aria-pressed={selectedDay?.date === day.date}
              >
                {day.label}
              </button>
            ))}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{selectedDay?.rows.length ? `Showing ${selectedDay.rows.length} team sellers` : "No completed team sales on this date"}</p>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 px-3 py-5 text-xs text-muted-foreground">No completed team sales on this date.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border/70">
              {rows.map((row, index) => (
                <Link key={`${row.role}-${row.id}`} href={row.href} className="flex min-w-0 items-center gap-3 px-3 py-3 text-xs transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="w-5 shrink-0 text-center font-semibold text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold text-foreground">{row.name}</span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{row.role === "AGENT" ? "Agent" : "Reseller"}</span>
                      {!row.active && <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">Inactive</span>}
                    </span>
                    <span className="mt-0.5 block text-muted-foreground">{row.orders} orders · {formatGhanaCedis(row.revenue)} sales</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold text-primary">{formatGhanaCedis(row.profit)}</span>
                    <span className="block text-[10px] text-muted-foreground">profit</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </details>
    </Card>
  )
}
