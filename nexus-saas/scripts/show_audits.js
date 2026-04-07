const { PrismaClient } = require('@prisma/client')

const db = new PrismaClient()

async function main() {
  const audits = await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 })
  console.log('Latest audits:', audits.length)
  for (const a of audits) {
    console.log('---')
    console.log('id:', a.id)
    console.log('action:', a.action)
    console.log('actor:', a.actorName, a.actorId)
    console.log('target:', a.targetType, a.targetId)
    console.log('organizationId:', a.organizationId)
    console.log('createdAt:', a.createdAt)
    try {
      console.log('before:', a.before ? JSON.parse(a.before) : null)
    } catch (e) {
      console.log('before (raw):', a.before)
    }
    try {
      console.log('after:', a.after ? JSON.parse(a.after) : null)
    } catch (e) {
      console.log('after (raw):', a.after)
    }
    console.log('meta:', a.meta)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
