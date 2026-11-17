import { redirect } from "next/navigation"

interface LegacyStorefrontProps {
  params: Promise<{ slug: string }>
}

export default async function LegacyStorefrontRedirect(props: LegacyStorefrontProps) {
  const params = await props.params;
  redirect(`/shop/${params.slug}`)
}
