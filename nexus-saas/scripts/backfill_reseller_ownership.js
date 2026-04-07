const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })

  for (const organization of organizations) {
    const agents = await prisma.agent.findMany({
      where: { organizationId: organization.id },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    const unlinkedResellers = await prisma.user.findMany({
      where: {
        organizationId: organization.id,
        role: 'RESELLER',
        parentAgentId: null,
      },
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    if (agents.length === 0 || unlinkedResellers.length === 0) {
      continue
    }

    const ownerAgent = agents[0]

    await prisma.user.updateMany({
      where: {
        organizationId: organization.id,
        role: 'RESELLER',
        parentAgentId: null,
      },
      data: { parentAgentId: ownerAgent.id },
    })

    console.log(
      JSON.stringify(
        {
          organizationId: organization.id,
          organizationName: organization.name,
          ownerAgentId: ownerAgent.id,
          ownerAgentName: ownerAgent.name,
          assignedResellers: unlinkedResellers.map((reseller) => ({
            id: reseller.id,
            name: reseller.name,
            email: reseller.email,
          })),
        },
        null,
        2
      )
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
