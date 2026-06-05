import AgentInviteRegisterClient from "./agent-invite-register-client"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?: {
    tenant?: string
  }
}

export default function AgentInviteRegisterPage({ searchParams }: Props) {
  const tenant = (searchParams?.tenant || "").trim()

  return <AgentInviteRegisterClient initialTenant={tenant} />
}
