const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

const db = new PrismaClient()

const DEFAULT_PASSWORD = "password123"
const ORG_SLUG = "quick-admin"

const plans = [
  {
    name: "Starter",
    description: "For a new data seller launching one clean storefront.",
    priceGHS: 99,
    maxProducts: 100,
    maxAgents: 5,
    features: ["1 subscriber workspace", "100 active products", "5 agents", "Storefront checkout", "Subscriber Paystack settlement", "Manual fulfillment workspace"],
  },
  {
    name: "Growth",
    description: "For operators building an agent and reseller sales network.",
    priceGHS: 199,
    maxProducts: 300,
    maxAgents: 25,
    features: ["1 subscriber workspace", "300 active products", "25 agents", "Reseller onboarding", "Storefront and API access", "Wallet, withdrawals, and order controls"],
  },
  {
    name: "Scale",
    description: "For high-volume teams that need more catalog and channel capacity.",
    priceGHS: 399,
    maxProducts: 1000,
    maxAgents: 100,
    features: ["1 subscriber workspace", "1,000 active products", "100 agents", "Reseller onboarding", "Storefront and API access", "Priority operational support"],
  },
]

const catalog = [
  { provider: "MTN", name: "MTN 1GB Data", source: 4.2, subscriber: 4.8, storefront: 5.5, agent: 5.0, agentStore: 5.8, reseller: 5.3, resellerStore: 6.0 },
  { provider: "MTN", name: "MTN 5GB Data", source: 20, subscriber: 22.5, storefront: 25, agent: 23, agentStore: 26, reseller: 24, resellerStore: 27 },
  { provider: "MTN", name: "MTN 10GB Data", source: 39, subscriber: 43, storefront: 48, agent: 44, agentStore: 49, reseller: 46, resellerStore: 51 },
  { provider: "TELECEL", name: "Telecel 5GB Data", source: 18, subscriber: 20.5, storefront: 24, agent: 21.5, agentStore: 25, reseller: 22.5, resellerStore: 26 },
  { provider: "AIRTELTIGO", name: "AT 10GB Data", source: 36, subscriber: 40, storefront: 46, agent: 41, agentStore: 48, reseller: 43, resellerStore: 50 },
]

async function upsertPlan(plan) {
  return db.plan.upsert({
    where: { name: plan.name },
    update: {
      description: plan.description,
      priceGHS: plan.priceGHS,
      maxProducts: plan.maxProducts,
      maxAgents: plan.maxAgents,
      features: JSON.stringify(plan.features),
    },
    create: {
      name: plan.name,
      description: plan.description,
      priceGHS: plan.priceGHS,
      maxProducts: plan.maxProducts,
      maxAgents: plan.maxAgents,
      features: JSON.stringify(plan.features),
    },
  })
}

async function ensureProduct(orgId, item) {
  let product = await db.product.findFirst({
    where: { organizationId: orgId, provider: item.provider, name: item.name },
  })

  if (!product) {
    product = await db.product.create({
      data: {
        organizationId: orgId,
        name: item.name,
        description: `${item.name} QA bundle`,
        provider: item.provider,
        price: item.subscriber,
        stock: 1000,
        category: "DATA_BUNDLE",
        bundleType: "DATA",
        active: true,
      },
    })
  } else {
    product = await db.product.update({
      where: { id: product.id },
      data: {
        price: item.subscriber,
        stock: 1000,
        active: true,
        category: "DATA_BUNDLE",
        bundleType: "DATA",
      },
    })
  }

  await db.basePrice.upsert({
    where: { productId_organizationId: { productId: product.id, organizationId: orgId } },
    update: { price: item.source },
    create: { productId: product.id, organizationId: orgId, price: item.source },
  })

  await db.subscriberStorefrontPrice.upsert({
    where: { productId_organizationId: { productId: product.id, organizationId: orgId } },
    update: { price: item.storefront },
    create: { productId: product.id, organizationId: orgId, price: item.storefront },
  })

  return product
}

async function ensureWalletCredit(userId, amount, performedByEmail) {
  const existing = await db.walletTransaction.findFirst({
    where: { userId, amount, method: "manual", performedByEmail, status: "success" },
  })

  if (!existing) {
    await db.walletTransaction.create({
      data: {
        userId,
        amount,
        method: "manual",
        status: "success",
        performedByEmail,
        performedByRole: "QA_SEED",
      },
    })
  }
}

async function ensureCustomerOrder({ orgId, customer, agentId, resellerId, product, status, source, sellerRole, paymentOwner, paymentStatus, externalReference }) {
  const existing = await db.order.findFirst({ where: { externalReference } })
  if (existing) return existing

  const savedCustomer = await db.customer.upsert({
    where: { email_organizationId: { email: customer.email, organizationId: orgId } },
    update: { name: customer.name, phone: customer.phone, agentId: agentId || undefined },
    create: {
      organizationId: orgId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      agentId: agentId || undefined,
    },
  })

  const unitPrice = product.price
  const profit = source === "DASHBOARD_BUY" ? 0 : Math.max(unitPrice - product.basePrice, 0)

  return db.order.create({
    data: {
      organizationId: orgId,
      customerId: savedCustomer.id,
      userId: resellerId || undefined,
      agentId: agentId || undefined,
      phoneNumber: customer.phone,
      total: unitPrice,
      status,
      source,
      sellerRole,
      sellerUserId: resellerId || undefined,
      sellerAgentId: agentId || undefined,
      customerType: source === "DASHBOARD_BUY" ? "DASHBOARD_USER" : "PUBLIC_CUSTOMER",
      paymentOwner,
      paymentStatus,
      fulfillmentMode: "MANUAL",
      externalReference,
      items: {
        create: {
          productId: product.id,
          quantity: 1,
          price: unitPrice,
          profit,
        },
      },
    },
  })
}

async function main() {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
  const createdPlans = await Promise.all(plans.map(upsertPlan))
  const growthPlan = createdPlans.find((plan) => plan.name === "Growth")

  await db.user.upsert({
    where: { email: "superadmin@quickdata.test" },
    update: {
      name: "Platform Superadmin",
      role: "SUPERADMIN",
      organizationId: null,
      active: true,
      signupStatus: "APPROVED",
      password: hash,
    },
    create: {
      email: "superadmin@quickdata.test",
      name: "Platform Superadmin",
      password: hash,
      role: "SUPERADMIN",
      active: true,
      signupStatus: "APPROVED",
    },
  })

  const org = await db.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: "Quick Data Hub", active: true },
    create: { name: "Quick Data Hub", slug: ORG_SLUG, active: true },
  })

  const subscriber = await db.user.upsert({
    where: { email: "admin@quickdata.test" },
    update: {
      name: "Subscriber Admin",
      role: "SUBSCRIBER",
      organizationId: org.id,
      active: true,
      signupStatus: "APPROVED",
      password: hash,
    },
    create: {
      email: "admin@quickdata.test",
      name: "Subscriber Admin",
      password: hash,
      role: "SUBSCRIBER",
      organizationId: org.id,
      active: true,
      signupStatus: "APPROVED",
    },
  })

  await db.subscription.upsert({
    where: { organizationId: org.id },
    update: {
      planId: growthPlan.id,
      status: "ACTIVE",
      nextBillingAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      canceledAt: null,
    },
    create: {
      organizationId: org.id,
      planId: growthPlan.id,
      status: "ACTIVE",
      nextBillingAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })

  await db.organizationPaymentSettings.upsert({
    where: { organizationId: org.id },
    update: {
      paystackPublicKey: "pk_test_seed_public_key",
      paystackSecretKeyEnc: "seed:encrypted:test-secret",
      paystackConnected: true,
      updatedById: subscriber.id,
    },
    create: {
      organizationId: org.id,
      paystackPublicKey: "pk_test_seed_public_key",
      paystackSecretKeyEnc: "seed:encrypted:test-secret",
      paystackConnected: true,
      updatedById: subscriber.id,
    },
  })

  let agent = await db.agent.findFirst({ where: { organizationId: org.id, name: "Portal Agent" } })
  if (!agent) {
    agent = await db.agent.create({
      data: {
        name: "Portal Agent",
        subscriberName: subscriber.name || "Subscriber Admin",
        organizationId: org.id,
        active: true,
        commissionPercent: 0,
      },
    })
  } else {
    agent = await db.agent.update({
      where: { id: agent.id },
      data: { active: true, subscriberName: subscriber.name || "Subscriber Admin" },
    })
  }

  const agentUser = await db.user.upsert({
    where: { email: "agent@quickdata.test" },
    update: {
      name: "Portal Agent User",
      role: "AGENT",
      organizationId: org.id,
      agentId: agent.id,
      parentAgentId: null,
      active: true,
      signupStatus: "APPROVED",
      password: hash,
    },
    create: {
      email: "agent@quickdata.test",
      name: "Portal Agent User",
      password: hash,
      role: "AGENT",
      organizationId: org.id,
      agentId: agent.id,
      parentAgentId: null,
      active: true,
      signupStatus: "APPROVED",
    },
  })

  const reseller = await db.user.upsert({
    where: { email: "reseller@quickdata.test" },
    update: {
      name: "Portal Reseller User",
      role: "RESELLER",
      organizationId: org.id,
      parentAgentId: agent.id,
      agentId: null,
      active: true,
      signupStatus: "APPROVED",
      password: hash,
    },
    create: {
      email: "reseller@quickdata.test",
      name: "Portal Reseller User",
      password: hash,
      role: "RESELLER",
      organizationId: org.id,
      parentAgentId: agent.id,
      agentId: null,
      active: true,
      signupStatus: "APPROVED",
    },
  })

  const products = []
  for (const item of catalog) {
    const product = await ensureProduct(org.id, item)
    products.push({ ...item, id: product.id })

    await db.agentPrice.upsert({
      where: { agentId_productId: { agentId: agent.id, productId: product.id } },
      update: { price: item.agent },
      create: { agentId: agent.id, productId: product.id, organizationId: org.id, price: item.agent },
    })
    await db.agentStorefrontPrice.upsert({
      where: { agentId_productId: { agentId: agent.id, productId: product.id } },
      update: { price: item.agentStore },
      create: { agentId: agent.id, productId: product.id, organizationId: org.id, price: item.agentStore },
    })
    await db.resellerPrice.upsert({
      where: { resellerId_productId: { resellerId: reseller.id, productId: product.id } },
      update: { price: item.reseller },
      create: { resellerId: reseller.id, productId: product.id, organizationId: org.id, price: item.reseller },
    })
    await db.resellerStorefrontPrice.upsert({
      where: { resellerId_productId: { resellerId: reseller.id, productId: product.id } },
      update: { price: item.resellerStore },
      create: { resellerId: reseller.id, productId: product.id, organizationId: org.id, price: item.resellerStore },
    })
  }

  await ensureWalletCredit(subscriber.id, 500, "superadmin@quickdata.test")
  await ensureWalletCredit(agentUser.id, 300, "admin@quickdata.test")
  await ensureWalletCredit(reseller.id, 150, "agent@quickdata.test")

  const mtn1 = products.find((item) => item.name === "MTN 1GB Data")
  const telecel5 = products.find((item) => item.name === "Telecel 5GB Data")
  const at10 = products.find((item) => item.name === "AT 10GB Data")

  const sampleOrders = await Promise.all([
    ensureCustomerOrder({
      orgId: org.id,
      customer: { name: "Ama Customer", email: "ama.customer@quickdata.test", phone: "0557574477" },
      agentId: null,
      resellerId: null,
      product: { id: mtn1.id, price: mtn1.storefront, basePrice: mtn1.source },
      status: "PENDING",
      source: "STOREFRONT",
      sellerRole: "SUBSCRIBER",
      paymentOwner: "STOREFRONT",
      paymentStatus: "PAID",
      externalReference: "qa-storefront-subscriber-001",
    }),
    ensureCustomerOrder({
      orgId: org.id,
      customer: { name: "Kofi Agent Buyer", email: "kofi.agent@quickdata.test", phone: "0201112233" },
      agentId: agent.id,
      resellerId: null,
      product: { id: telecel5.id, price: telecel5.agentStore, basePrice: telecel5.agent },
      status: "PROCESSING",
      source: "STOREFRONT",
      sellerRole: "AGENT",
      paymentOwner: "STOREFRONT",
      paymentStatus: "PAID",
      externalReference: "qa-storefront-agent-001",
    }),
    ensureCustomerOrder({
      orgId: org.id,
      customer: { name: "Esi Reseller Buyer", email: "esi.reseller@quickdata.test", phone: "0262223344" },
      agentId: agent.id,
      resellerId: reseller.id,
      product: { id: at10.id, price: at10.resellerStore, basePrice: at10.reseller },
      status: "COMPLETED",
      source: "STOREFRONT",
      sellerRole: "RESELLER",
      paymentOwner: "STOREFRONT",
      paymentStatus: "PAID",
      externalReference: "qa-storefront-reseller-001",
    }),
  ])

  const paymentRef = "qa-paystack-storefront-001"
  const payment = await db.storefrontPayment.findUnique({ where: { reference: paymentRef } })
  if (!payment) {
    await db.storefrontPayment.create({
      data: {
        organizationId: org.id,
        reference: paymentRef,
        amount: sampleOrders.reduce((sum, order) => sum + order.total, 0),
        status: "SUCCESS",
        orderIds: JSON.stringify(sampleOrders.map((order) => order.id)),
        metadata: JSON.stringify({ source: "QA_SEED" }),
        paidAt: new Date(),
      },
    })
  }

  console.log("QA seed ready")
  console.log(`Password for all demo accounts: ${DEFAULT_PASSWORD}`)
  console.log("Superadmin: superadmin@quickdata.test -> /admin")
  console.log("Subscriber: admin@quickdata.test -> /dashboard")
  console.log("Agent:      agent@quickdata.test -> /agent")
  console.log("Reseller:   reseller@quickdata.test -> /reseller")
  console.log(`Storefront: /store/${ORG_SLUG}`)
  console.log(`Agent store: /store/${ORG_SLUG}/agent/${agent.id}`)
  console.log(`Reseller store: /store/${ORG_SLUG}/reseller/${reseller.id}`)
}

main()
  .catch((error) => {
    console.error("Error creating QA portal data:", error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
