const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const db = new PrismaClient()

async function main() {
  const defaultPassword = 'password123'
  const hash = await bcrypt.hash(defaultPassword, 10)

  // 1) Admin portal org + subscriber admin user
  const org = await db.organization.upsert({
    where: { slug: 'quick-admin' },
    update: {},
    create: {
      name: 'Quick Admin Org',
      slug: 'quick-admin',
      active: true,
    },
  })

  const adminUser = await db.user.upsert({
    where: { email: 'admin@quickdata.test' },
    update: {
      name: 'Portal Admin',
      role: 'SUBSCRIBER',
      organizationId: org.id,
      password: hash,
    },
    create: {
      email: 'admin@quickdata.test',
      name: 'Portal Admin',
      password: hash,
      role: 'SUBSCRIBER',
      organizationId: org.id,
    },
  })

  // 2) Agent record + agent portal user
  let agent = await db.agent.findFirst({
    where: {
      organizationId: org.id,
      name: 'Portal Agent',
    },
  })

  if (!agent) {
    agent = await db.agent.create({
      data: {
        name: 'Portal Agent',
        subscriberName: adminUser.name || 'Portal Admin',
        organizationId: org.id,
        active: true,
        commissionPercent: 0,
      },
    })
  }

  await db.user.upsert({
    where: { email: 'agent@quickdata.test' },
    update: {
      name: 'Portal Agent User',
      role: 'AGENT',
      organizationId: org.id,
      agentId: agent.id,
      parentAgentId: null,
      password: hash,
    },
    create: {
      email: 'agent@quickdata.test',
      name: 'Portal Agent User',
      password: hash,
      role: 'AGENT',
      organizationId: org.id,
      agentId: agent.id,
      parentAgentId: null,
    },
  })

  // 3) Reseller portal user (linked to parent agent)
  await db.user.upsert({
    where: { email: 'reseller@quickdata.test' },
    update: {
      name: 'Portal Reseller User',
      role: 'RESELLER',
      organizationId: org.id,
      parentAgentId: agent.id,
      agentId: null,
      password: hash,
    },
    create: {
      email: 'reseller@quickdata.test',
      name: 'Portal Reseller User',
      password: hash,
      role: 'RESELLER',
      organizationId: org.id,
      parentAgentId: agent.id,
      agentId: null,
    },
  })

  console.log('✓ Portal users ready')
  console.log('Admin portal (SUBSCRIBER): admin@quickdata.test / password123 -> /dashboard')
  console.log('Agent portal:              agent@quickdata.test / password123 -> /agent')
  console.log('Reseller portal:           reseller@quickdata.test / password123 -> /reseller')
  console.log('Login URL: http://localhost:3000/login')
}

main()
  .catch((e) => {
    console.error('Error creating portal users:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
