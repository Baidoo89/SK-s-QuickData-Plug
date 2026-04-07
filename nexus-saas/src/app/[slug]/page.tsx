import { redirect } from "next/navigation"

interface LegacyStorefrontProps {
  params: { slug: string }
}

export default function LegacyStorefrontRedirect({ params }: LegacyStorefrontProps) {
  redirect(`/store/${params.slug}`)
}
