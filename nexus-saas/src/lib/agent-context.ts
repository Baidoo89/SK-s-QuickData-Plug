import { db } from "@/lib/db"

export async function resolveAgentContext(userId: string, organizationId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, agentId: true },
  })

  if (user?.agentId) return { agentId: user.agentId, user }

  const agent = await db.agent.findFirst({
    where: {
      organizationId,
      OR: [{ user: { id: userId } }, { name: user?.name ?? undefined }],
    },
    select: { id: true },
  })

  if (!agent) return { agentId: null, user }

  await db.user.update({
    where: { id: userId },
    data: { agentId: agent.id, role: "AGENT" },
  })

  return { agentId: agent.id, user }
}
