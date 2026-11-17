import { beforeEach, describe, expect, it, vi } from "vitest"

const dependencies = vi.hoisted(() => ({
  auth: vi.fn(),
  db: {
    user: { findUnique: vi.fn() },
    subscription: { findUnique: vi.fn(), update: vi.fn() },
    product: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    basePrice: { upsert: vi.fn() },
    $transaction: vi.fn(), $queryRaw: vi.fn(), $executeRaw: vi.fn(),
  },
}))

vi.mock("@/auth", () => ({ auth: dependencies.auth }))
vi.mock("@/lib/db", () => ({ db: dependencies.db }))

// Exercise the actual routes, auth guards, schemas and SQL helper. Only the
// session provider and database are replaced. No test auth routes are exposed.
import { POST } from "@/app/api/products/route"
import { PUT, DELETE } from "@/app/api/products/[id]/route"

type Product = { id: string; organizationId: string; name: string; price: number; active: boolean; [key: string]: unknown }
type State = { products: Record<string, Product>; base: Record<string, number>; shop: Record<string, number>; orders: Record<string, number> }
let state: State
let actor: { id: string; email: string; role: string; organizationId: string | null; active: boolean; signupStatus: string }
let signedIn: boolean
let failure: "base" | "shop" | "delete-reference" | null

const priceKey = (org: string, product: string) => `${org}:${product}`
const newProduct = { name: " 2 GB ", price: 8.5, basePrice: 8, storefrontPrice: 10, provider: "MTN", category: "DATA_BUNDLE", active: true }
const context = (id = "product-a") => ({ params: Promise.resolve({ id }) })
const request = (method: string, body?: unknown) => new Request("http://localhost/api/products/product-a", {
  method,
  ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
})

// The stand-in commits a copied state only when the callback succeeds. This
// detects a shop-price write that escapes the transaction, but does not replace
// a real PostgreSQL rollback/concurrency integration test.
function transactionClient(pending: State) {
  const find = (where: { id: string; organizationId: string }) => {
    const product = pending.products[where.id]
    return product?.organizationId === where.organizationId ? product : null
  }
  return {
    product: {
      findFirst: vi.fn(async ({ where }) => {
        const product = find(where)
        return product ? { ...product, _count: { orderItems: pending.orders[product.id] ?? 0 } } : null
      }),
      create: vi.fn(async ({ data }) => {
        const product: Product = { ...data, id: `created-${Object.keys(pending.products).length}` }
        pending.products[product.id] = product
        return product
      }),
      update: vi.fn(async ({ where, data }) => {
        const product = find(where)
        if (!product) throw new Error("Product outside organization")
        const supplied = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
        return pending.products[product.id] = { ...product, ...supplied }
      }),
      delete: vi.fn(async ({ where }) => {
        const product = find(where)
        if (!product) throw new Error("Product outside organization")
        if (failure === "delete-reference") throw Object.assign(new Error("Referenced by a concurrent purchase"), { code: "P2003" })
        if (pending.orders[product.id]) throw new Error("Order history must be preserved")
        delete pending.products[product.id]
        return product
      }),
    },
    basePrice: {
      upsert: vi.fn(async ({ where, create, update }) => {
        if (failure === "base") throw new Error("Injected base-price write failure")
        const { productId, organizationId } = where.productId_organizationId
        const key = priceKey(organizationId, productId)
        const price = key in pending.base ? update.price : create.price
        pending.base[key] = price
        return { productId, organizationId, price }
      }),
      deleteMany: vi.fn(async ({ where }) => { delete pending.base[priceKey(where.organizationId, where.productId)]; return { count: 1 } }),
    },
    agentPrice: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    customPrice: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    orderItem: { deleteMany: vi.fn(async () => { throw new Error("Order history must never be deleted") }) },
    $queryRaw: vi.fn(async (_sql: TemplateStringsArray, id: unknown, amount: unknown, productId: unknown, organizationId: unknown) => {
      if (failure === "shop") throw new Error("Injected shop-price write failure")
      pending.shop[priceKey(String(organizationId), String(productId))] = Number(amount)
      return [{ id, price: amount, productId, organizationId }]
    }),
    $executeRaw: vi.fn(async (sql: TemplateStringsArray, productId: unknown, organizationId: unknown) => {
      if (sql.join("").includes('"SubscriberStorefrontPrice"')) delete pending.shop[priceKey(String(organizationId), String(productId))]
      return 1
    }),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  state = {
    products: {
      "product-a": { id: "product-a", organizationId: "org-a", name: "1 GB", price: 4.5, active: true, description: "Existing bundle" },
      "product-b": { id: "product-b", organizationId: "org-b", name: "Private bundle", price: 30, active: true },
    },
    base: { "org-a:product-a": 4, "org-b:product-b": 25 },
    shop: { "org-a:product-a": 5, "org-b:product-b": 35 },
    orders: {},
  }
  actor = { id: "owner-a", email: "owner@example.test", role: "SUBSCRIBER", organizationId: "org-a", active: true, signupStatus: "APPROVED" }
  signedIn = true
  failure = null
  dependencies.auth.mockImplementation(async () => signedIn ? { user: { email: actor.email } } : null)
  dependencies.db.user.findUnique.mockImplementation(async () => actor)
  dependencies.db.subscription.findUnique.mockResolvedValue({ status: "ACTIVE", nextBillingAt: null, plan: { maxProducts: 100 } })
  dependencies.db.product.count.mockImplementation(async ({ where }) => Object.values(state.products).filter(product => product.organizationId === where.organizationId).length)
  dependencies.db.$transaction.mockImplementation(async callback => {
    const pending = structuredClone(state)
    const value = await callback(transactionClient(pending))
    state = pending
    return value
  })
  dependencies.db.$queryRaw.mockImplementation(async () => { throw new Error("SQL write escaped the transaction") })
  for (const fn of [dependencies.db.product.create, dependencies.db.product.update, dependencies.db.product.delete, dependencies.db.basePrice.upsert, dependencies.db.$executeRaw]) {
    fn.mockImplementation(async () => { throw new Error("Write escaped the transaction") })
  }
})

const mutations = [
  { method: "POST", run: () => POST(request("POST", newProduct)) },
  { method: "PUT", run: () => PUT(request("PUT", { active: false }), context()) },
  { method: "DELETE", run: () => DELETE(request("DELETE"), context()) },
]

describe.each(mutations)("$method permissions", ({ run }) => {
  it.each(["AGENT", "RESELLER", "UNKNOWN"])("rejects %s before starting a write", async role => {
    actor.role = role
    const before = structuredClone(state)
    const response = await run()
    expect(response.status).toBe(403)
    expect(dependencies.db.$transaction).not.toHaveBeenCalled()
    expect(state).toEqual(before)
  })
  it("requires an authenticated account", async () => {
    signedIn = false
    expect((await run()).status).toBe(401)
    expect(dependencies.db.$transaction).not.toHaveBeenCalled()
  })
  it.each(["inactive", "unapproved", "no organization"])("rejects an account with %s", async condition => {
    if (condition === "inactive") actor.active = false
    if (condition === "unapproved") actor.signupStatus = "PENDING"
    if (condition === "no organization") actor.organizationId = null
    expect((await run()).status).toBe(condition === "no organization" ? 400 : 401)
    expect(dependencies.db.$transaction).not.toHaveBeenCalled()
  })
})

it.each(["SUBSCRIBER", "SUPERADMIN"])("allows %s to create only inside its own organization", async role => {
  actor.role = role
  const response = await POST(request("POST", { ...newProduct, organizationId: "org-b", id: "product-b" }))
  expect(response.status).toBe(201)
  const { data } = await response.json()
  expect(data).toMatchObject({ name: "2 GB", organizationId: "org-a", price: 8.5 })
  expect(state.base[priceKey("org-a", data.id)]).toBe(8)
  expect(state.shop[priceKey("org-a", data.id)]).toBe(10)
  expect(state.products["product-b"].name).toBe("Private bundle")
  expect(dependencies.db.$queryRaw).not.toHaveBeenCalled()
})

it.each(["PUT", "DELETE"])("%s cannot modify a product from another organization", async method => {
  const before = structuredClone(state)
  const response = method === "PUT" ? await PUT(request(method, { price: 0 }), context("product-b")) : await DELETE(request(method), context("product-b"))
  expect(response.status).toBe(404)
  expect(state).toEqual(before)
})

it("keeps existing prices when a product is renamed or hidden", async () => {
  const response = await PUT(request("PUT", { name: "Renamed bundle", active: false, organizationId: "org-b" }), context())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ id: "product-a", organizationId: "org-a", name: "Renamed bundle", price: 4.5, active: false })
  expect(state.base["org-a:product-a"]).toBe(4)
  expect(state.shop["org-a:product-a"]).toBe(5)
})

it("does not invent price records during a metadata-only edit", async () => {
  delete state.base["org-a:product-a"]
  delete state.shop["org-a:product-a"]
  expect((await PUT(request("PUT", { active: false }), context())).status).toBe(200)
  expect(state.base).not.toHaveProperty("org-a:product-a")
  expect(state.shop).not.toHaveProperty("org-a:product-a")
})

it.each([
  { field: "price", value: 8, expected: [8, 4, 5] },
  { field: "basePrice", value: 3, expected: [4.5, 3, 5] },
  { field: "storefrontPrice", value: 7, expected: [4.5, 4, 7] },
])("updating $field preserves the other prices", async ({ field, value, expected }) => {
  expect((await PUT(request("PUT", { [field]: value }), context())).status).toBe(200)
  expect([state.products["product-a"].price, state.base["org-a:product-a"], state.shop["org-a:product-a"]]).toEqual(expected)
})

it("preserves explicit zero prices", async () => {
  expect((await PUT(request("PUT", { price: 0, basePrice: 0, storefrontPrice: 0 }), context())).status).toBe(200)
  expect([state.products["product-a"].price, state.base["org-a:product-a"], state.shop["org-a:product-a"]]).toEqual([0, 0, 0])
})

it("creates zero-price defaults without replacing zero with another amount", async () => {
  const response = await POST(request("POST", { name: "Free sample", price: 0, active: false }))
  expect(response.status).toBe(201)
  const { data } = await response.json()
  expect(data).toMatchObject({ price: 0, active: false, provider: "MTN", stock: 0 })
  expect(state.base[priceKey("org-a", data.id)]).toBe(0)
  expect(state.shop[priceKey("org-a", data.id)]).toBe(0)
})

it.each([{ body: {} }, { body: { organizationId: "org-b", id: "product-b" } }, { body: null }, { body: [] }])("rejects an empty or unsupported update: $body", async ({ body }) => {
  expect((await PUT(request("PUT", body), context())).status).toBe(400)
  expect(dependencies.db.$transaction).not.toHaveBeenCalled()
})

it("still requires an active subscription for new products", async () => {
  dependencies.db.subscription.findUnique.mockResolvedValue({ status: "CANCELED", nextBillingAt: null, plan: { maxProducts: 100 } })
  expect((await POST(request("POST", newProduct))).status).toBe(402)
  expect(dependencies.db.$transaction).not.toHaveBeenCalled()
})

it("still enforces the organization's product limit", async () => {
  dependencies.db.subscription.findUnique.mockResolvedValue({ status: "ACTIVE", nextBillingAt: null, plan: { maxProducts: 1 } })
  expect((await POST(request("POST", newProduct))).status).toBe(400)
  expect(dependencies.db.$transaction).not.toHaveBeenCalled()
})

describe.each(["base", "shop"] as const)("failed %s write", stage => {
  it.each(["POST", "PUT"])("rolls back every part of a %s save", async method => {
    failure = stage
    const before = structuredClone(state)
    const response = method === "POST" ? await POST(request(method, newProduct)) : await PUT(request(method, { name: "Changed", price: 9, basePrice: 8, storefrontPrice: 10 }), context())
    expect(response.status).toBe(500)
    expect(state).toEqual(before)
    expect(dependencies.db.$queryRaw).not.toHaveBeenCalled()
  })
})

describe.each([
  { name: "negative price", patch: { price: -1 } },
  { name: "negative cost", patch: { basePrice: -1 } },
  { name: "null shop price", patch: { storefrontPrice: null } },
  { name: "text price", patch: { price: "12garbage" } },
  { name: "boolean cost", patch: { basePrice: false } },
  { name: "blank name", patch: { name: "   " } },
  { name: "fractional stock", patch: { stock: 2.5 } },
  { name: "overflowing stock", patch: { stock: 2147483648 } },
  { name: "text active flag", patch: { active: "false" } },
])("invalid $name", ({ patch }) => {
  it.each(["POST", "PUT"])("rejects %s without writing", async method => {
    const response = method === "POST" ? await POST(request(method, { ...newProduct, ...patch })) : await PUT(request(method, patch), context())
    expect(response.status).toBe(400)
    expect(dependencies.db.$transaction).not.toHaveBeenCalled()
  })
})

it.each(["POST", "PUT"])("%s rejects malformed JSON and non-finite prices", async method => {
  for (const body of ['{"name":', '{"name":"Invalid","price":1e400}']) {
    const req = new Request("http://localhost/api/products/product-a", { method, body, headers: { "Content-Type": "application/json" } })
    const response = method === "POST" ? await POST(req) : await PUT(req, context())
    expect(response.status).toBe(400)
  }
  expect(dependencies.db.$transaction).not.toHaveBeenCalled()
})

it("retains order history when deletion is requested", async () => {
  state.orders["product-a"] = 1
  const before = structuredClone(state)
  const response = await DELETE(request("DELETE"), context())
  expect(response.status).toBe(409)
  expect((await response.json()).error.message).toContain("Hide it")
  expect(state).toEqual(before)
})

it("rolls back cleanup if a product becomes referenced during deletion", async () => {
  failure = "delete-reference"
  const before = structuredClone(state)
  expect((await DELETE(request("DELETE"), context())).status).toBe(409)
  expect(state).toEqual(before)
})

it("deletes an unused own product without touching another business", async () => {
  const foreign = structuredClone(state.products["product-b"])
  expect((await DELETE(request("DELETE"), context())).status).toBe(204)
  expect(state.products["product-a"]).toBeUndefined()
  expect(state.base["org-a:product-a"]).toBeUndefined()
  expect(state.shop["org-a:product-a"]).toBeUndefined()
  expect(state.products["product-b"]).toEqual(foreign)
  expect(state.base["org-b:product-b"]).toBe(25)
  expect(state.shop["org-b:product-b"]).toBe(35)
})
