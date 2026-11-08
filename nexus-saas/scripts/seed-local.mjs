import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { assertLocalDatabase, databaseUrl, readLocalConfig, localRoot, appPort } from "./local-environment.mjs"

const config = readLocalConfig()
const url = assertLocalDatabase(databaseUrl(config), "quickdata_dev")
const db = new PrismaClient({ datasources: { db: { url } } })

try {
  const org = await db.organization.upsert({ where: { slug: "local-test-shop" }, update: {}, create: { name: "QuickData Local Test Shop", slug: "local-test-shop", active: true } })
  const plan = await db.plan.upsert({ where: { name: "Local Test Plan" }, update: {}, create: { name: "Local Test Plan", priceGHS: 0, features: "[]", maxProducts: 1000, maxAgents: 50, visible: false } })
  await db.subscription.upsert({ where: { organizationId: org.id }, update: { status: "ACTIVE", canceledAt: null, nextBillingAt: null }, create: { organizationId: org.id, planId: plan.id, status: "ACTIVE" } })
  const hash = await bcrypt.hash(config.accountPassword, 10)
  let agent = await db.agent.findFirst({ where: { organizationId: org.id, name: "Local Test Agent" } })
  if (!agent) agent = await db.agent.create({ data: { name: "Local Test Agent", organizationId: org.id, active: true, commissionPercent: 0 } })
  const accounts = []
  for (const [role, label] of [["SUBSCRIBER", "owner"], ["AGENT", "agent"], ["RESELLER", "reseller"], ["SUPERADMIN", "admin"]]) {
    const email = `${label}@quickdata.test`
    const data = { name: `Local Test ${label}`, role, organizationId: org.id, password: hash, active: true, signupStatus: "APPROVED", emailVerified: new Date(), emailVerificationRequired: false, ...(role === "AGENT" ? { agentId: agent.id } : {}), ...(role === "RESELLER" ? { parentAgentId: agent.id } : {}) }
    const user = await db.user.upsert({ where: { email }, update: data, create: { ...data, email } })
    if (!await db.walletTransaction.findFirst({ where: { userId: user.id, performedByRole: "LOCAL_TEST_SEED" } })) {
      await db.walletTransaction.create({ data: { userId: user.id, amount: 1000, method: "manual", status: "success", performedByRole: "LOCAL_TEST_SEED" } })
    }
    accounts.push({ role, email, password: config.accountPassword })
  }
  for (const [key, provider, name, base, shop] of [["mtn-1", "MTN", "1 GB", 4, 5], ["mtn-5", "MTN", "5 GB", 20, 25], ["tel-5", "TELECEL", "5 GB", 18, 22], ["at-5", "AIRTELTIGO", "5 GB", 18, 22]]) {
    const id = `local-sample-${key}`
    const product = await db.product.upsert({ where: { id }, update: {}, create: { id, name, provider, organizationId: org.id, description: "Local test bundle", category: "DATA_BUNDLE", bundleType: "DATA", price: shop, stock: 1000, active: true } })
    await db.basePrice.upsert({ where: { productId_organizationId: { productId: product.id, organizationId: org.id } }, update: {}, create: { productId: product.id, organizationId: org.id, price: base } })
    await db.subscriberStorefrontPrice.upsert({ where: { productId_organizationId: { productId: product.id, organizationId: org.id } }, update: {}, create: { productId: product.id, organizationId: org.id, price: shop } })
  }
  await writeFile(path.join(localRoot, "accounts.json"), JSON.stringify({ url: `http://127.0.0.1:${appPort}/login`, note: "Local test accounts only. Fake wallet funds; payment and delivery integrations are unconfigured.", accounts }, null, 2), { mode: 0o600 })
  console.log("Local owner, agent, reseller and admin accounts are ready. Sign-in details are in .local/accounts.json.")
  console.log("The local seed preserves payment settings and does not configure keys. Seeded wallet balances are test data.")
} finally {
  await db.$disconnect()
}
