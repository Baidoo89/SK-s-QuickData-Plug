"use client"

import { ReactNode, useState } from "react"

import { Button } from "@/components/ui/button"

export function DevCopyButton({ value, children }: { value: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="w-full"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }}
    >
      {copied ? "Copied" : children}
    </Button>
  )
}
