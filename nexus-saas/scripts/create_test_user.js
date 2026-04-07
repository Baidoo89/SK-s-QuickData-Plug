const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const db = new PrismaClient()

async function main() {
  console.log('Creating test organization and SUPERADMIN user...')
  
  const hash = await bcrypt.hash('password123', 10)
  
  const org = await db.organization.upsert({
    where: { slug: 'test-org' },
    update: {},
    create: {
      name: 'Test Organization',
      slug: 'test-org',
      active: true,
    },
  })
  
  const user = await db.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      email: 'admin@test.com',
      name: 'Admin User',
      password: hash,
      role: 'SUPERADMIN',
      organizationId: org.id,
    },
  })
  
  console.log('✓ Created test organization:', org.name, `(${org.slug})`)
  console.log('✓ Created SUPERADMIN user:', user.email)
  console.log('\nLogin credentials:')
  console.log('  Email: admin@test.com')
  console.log('  Password: password123')
  console.log('\nVisit: http://localhost:3000/login')
}

main()
  .then(() => {
    console.log('\n✓ Setup complete')
    process.exit(0)
  })
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
