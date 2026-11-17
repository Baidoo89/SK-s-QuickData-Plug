import AgentInviteRegisterClient from "./agent-invite-register-client"

export const dynamic = "force-dynamic"

type Props = {
  searchParams?: Promise<{
    tenant?: string
  }>
}

export default async function AgentInviteRegisterPage(props: Props) {
  const searchParams = await props.searchParams;
  const tenant = (searchParams?.tenant || "").trim()

  return <AgentInviteRegisterClient initialTenant={tenant} />
}
