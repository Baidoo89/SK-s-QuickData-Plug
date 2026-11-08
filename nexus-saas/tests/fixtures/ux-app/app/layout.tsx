import type { ReactNode } from "react"
import "@/app/globals.css"
import { Toaster } from "@/components/ui/toaster"

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{ fontFamily: "Arial, sans-serif" }}>{children}<Toaster /></body></html>
}
