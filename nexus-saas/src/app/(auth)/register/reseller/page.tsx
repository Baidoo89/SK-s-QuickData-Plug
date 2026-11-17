import ResellerInviteRegisterClient from "./reseller-invite-register-client"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?: Promise<{
    agentId?: string
  }>
}

export default async function ResellerInviteRegisterPage(props: Props) {
  const searchParams = await props.searchParams;
  const agentId = (searchParams?.agentId || "").trim()

  return <ResellerInviteRegisterClient initialAgentId={agentId} />
}
