const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    where: { organizationId: 'cmnm7ynuj0000ay7l7iurxbre' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      agentId: true,
      parentAgentId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(JSON.stringify(users, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  await prisma.$disconnect()
})
