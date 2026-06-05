import ResellerInviteRegisterClient from "./reseller-invite-register-client"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?: {
    agentId?: string
  }
}

export default function ResellerInviteRegisterPage({ searchParams }: Props) {
  const agentId = (searchParams?.agentId || "").trim()

  return <ResellerInviteRegisterClient initialAgentId={agentId} />
}
