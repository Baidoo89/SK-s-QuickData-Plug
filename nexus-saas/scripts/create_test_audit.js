const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()

async function main() {
  const org = await db.organization.findFirst({ include: { products: true } })
  if (!org) {
    console.log('No organization found')
    return
  }

  console.log('Using org:', org.id, org.name, 'active=', org.active)

  const before = { orgActive: org.active, products: org.products.map(p => ({ id: p.id, active: p.active })) }
  const newActive = !org.active

  const result = await db.$transaction(async (tx) => {
    const updatedOrg = await tx.organization.update({ where: { id: org.id }, data: { active: newActive } })
    const prodRes = await tx.product.updateMany({ where: { organizationId: org.id }, data: { active: newActive } })

    const audit = await tx.auditLog.create({
      data: {
        actorId: 'script',
        actorName: 'automated-test',
        action: newActive ? 'ACTIVATE_ORG' : 'DEACTIVATE_ORG',
        targetType: 'Organization',
        targetId: org.id,
        organizationId: org.id,
        before: JSON.stringify(before),
        after: JSON.stringify({ orgActive: newActive }),
        meta: JSON.stringify({ productsAffected: prodRes.count }),
      }
    })

    return { updatedOrg, prodRes, audit }
  })

  console.log('Toggled org to', result.updatedOrg.active)
  console.log('Products touched:', result.prodRes.count)
  console.log('Created audit id:', result.audit.id)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
