import Link from "next/link"

import { cn } from "@/lib/utils"
import { getSupportWhatsappHref } from "@/lib/support-contact"
import { WhatsAppIcon } from "@/components/support/whatsapp-icon"

type WhatsAppSupportButtonProps = {
  label?: string
  message?: string
  className?: string
  variant?: "inline" | "floating"
}

export function WhatsAppSupportButton({
  label = "Chat on WhatsApp",
  message,
  className,
  variant = "inline",
}: WhatsAppSupportButtonProps) {
  const href = getSupportWhatsappHref(message)
  if (!href) return null

  if (variant === "floating") {
    return (
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={cn(
          "fixed bottom-4 right-4 z-[80] flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-[#1ebe5d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-5 sm:right-5",
          className,
        )}
      >
        <WhatsAppIcon className="h-6 w-6" />
      </Link>
    )
  }

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1ebe5d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <WhatsAppIcon className="h-4 w-4" />
      {label}
    </Link>
  )
}
