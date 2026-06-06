import { db } from "@/lib/db"
import { normalizeProviderKey } from "@/lib/provider-connection"

export type ProviderTemplate = {
  templateKey: string
  name: string
  description: string | null
  authType: "NONE" | "BEARER" | "API_KEY"
  authHeader: string
  authPrefix: string | null
  requestTemplate: string
  statusPath: string
  referencePath: string
  messagePath: string
  statusMap: {
    completed: string[]
    failed: string[]
    pending: string[]
  }
  active: boolean
}

type ProviderTemplateRow = {
  templateKey: string
  name: string
  description: string | null
  authType: string
  authHeader: string
  authPrefix: string | null
  requestTemplate: string | null
  statusPath: string | null
  referencePath: string | null
  messagePath: string | null
  statusMap: string | null
  active: boolean | null
}

const DEFAULT_STATUS_MAP = {
  completed: ["COMPLETED", "SUCCESS", "SUCCESSFUL", "DELIVERED"],
  failed: ["FAILED", "FAIL", "REJECTED", "CANCELLED", "CANCELED"],
  pending: ["PENDING", "PROCESSING", "QUEUED", "ACCEPTED"],
}

const DEFAULT_REQUEST_TEMPLATE = JSON.stringify({
  orderId: "{{orderId}}",
  productId: "{{productId}}",
  externalProductCode: "{{externalProductCode}}",
  network: "{{network}}",
  phone: "{{phone}}",
  quantity: "{{quantity}}",
  amount: "{{amount}}",
})

const SKPLUG_REQUEST_TEMPLATE = JSON.stringify({
  recipient: "{{phone}}",
  network: "{{network}}",
  gb_size: "{{externalProductCode}}",
})

export function getFallbackProviderTemplate(templateKey = "generic-json"): ProviderTemplate {
  const normalized = normalizeProviderKey(templateKey || "generic-json")

  if (normalized === "skplug" || normalized === "sk-plug") {
    return {
      templateKey: "skplug",
      name: "SKPlug Data API",
      description: "Submits data orders to SKPlug using recipient, network, and gb_size.",
      authType: "BEARER",
      authHeader: "Authorization",
      authPrefix: "Bearer",
      requestTemplate: SKPLUG_REQUEST_TEMPLATE,
      statusPath: "status",
      referencePath: "order_id",
      messagePath: "message",
      statusMap: {
        completed: ["DELIVERED", "COMPLETED", "SUCCESS", "SUCCESSFUL"],
        failed: ["FAILED", "FAIL", "REJECTED", "CANCELLED", "CANCELED"],
        pending: ["PENDING", "PROCESSING", "QUEUED", "ACCEPTED"],
      },
      active: true,
    }
  }

  return {
    templateKey: normalized,
    name: "Generic JSON Provider",
    description: "Default order payload used for providers that accept the Techdalt standard JSON format.",
    authType: "BEARER",
    authHeader: "Authorization",
    authPrefix: "Bearer",
    requestTemplate: DEFAULT_REQUEST_TEMPLATE,
    statusPath: "status",
    referencePath: "reference",
    messagePath: "message",
    statusMap: DEFAULT_STATUS_MAP,
    active: true,
  }
}

function parseStatusMap(value: string | null | undefined) {
  if (!value) return DEFAULT_STATUS_MAP
  try {
    const parsed = JSON.parse(value)
    return {
      completed: Array.isArray(parsed?.completed) ? parsed.completed.map(String) : DEFAULT_STATUS_MAP.completed,
      failed: Array.isArray(parsed?.failed) ? parsed.failed.map(String) : DEFAULT_STATUS_MAP.failed,
      pending: Array.isArray(parsed?.pending) ? parsed.pending.map(String) : DEFAULT_STATUS_MAP.pending,
    }
  } catch {
    return DEFAULT_STATUS_MAP
  }
}

function mapTemplate(row: ProviderTemplateRow | null | undefined): ProviderTemplate | null {
  if (!row) return null
  const authType = row.authType === "NONE" || row.authType === "API_KEY" ? row.authType : "BEARER"

  return {
    templateKey: normalizeProviderKey(row.templateKey),
    name: row.name?.trim() || "Provider Template",
    description: row.description,
    authType,
    authHeader: row.authHeader?.trim() || "Authorization",
    authPrefix: row.authPrefix?.trim() || null,
    requestTemplate: row.requestTemplate?.trim() || DEFAULT_REQUEST_TEMPLATE,
    statusPath: row.statusPath?.trim() || "status",
    referencePath: row.referencePath?.trim() || "reference",
    messagePath: row.messagePath?.trim() || "message",
    statusMap: parseStatusMap(row.statusMap),
    active: row.active !== false,
  }
}

export async function getProviderTemplate(templateKey = "generic-json") {
  const normalized = normalizeProviderKey(templateKey)

  try {
    const rows = await db.$queryRaw<ProviderTemplateRow[]>`
      SELECT
        "templateKey",
        "name",
        "description",
        "authType",
        "authHeader",
        "authPrefix",
        "requestTemplate",
        "statusPath",
        "referencePath",
        "messagePath",
        "statusMap",
        "active"
      FROM "ProviderTemplate"
      WHERE "templateKey" = ${normalized}
        AND "active" = true
      LIMIT 1
    `

    return mapTemplate(rows[0]) || getFallbackProviderTemplate(normalized)
  } catch {
    return getFallbackProviderTemplate(normalized)
  }
}

export async function listProviderTemplates() {
  const builtInTemplates = [getFallbackProviderTemplate("generic-json"), getFallbackProviderTemplate("skplug")]

  try {
    const rows = await db.$queryRaw<ProviderTemplateRow[]>`
      SELECT
        "templateKey",
        "name",
        "description",
        "authType",
        "authHeader",
        "authPrefix",
        "requestTemplate",
        "statusPath",
        "referencePath",
        "messagePath",
        "statusMap",
        "active"
      FROM "ProviderTemplate"
      WHERE "active" = true
      ORDER BY "name" ASC
    `

    const templates = rows.map(mapTemplate).filter((template): template is ProviderTemplate => Boolean(template))
    const seen = new Set(templates.map((template) => template.templateKey))
    const missingBuiltIns = builtInTemplates.filter((template) => !seen.has(template.templateKey))
    return [...templates, ...missingBuiltIns]
  } catch {
    return builtInTemplates
  }
}

export async function getProviderProductMapping(input: {
  organizationId: string
  providerKey: string
  productId: string
}) {
  try {
    const rows = await db.$queryRaw<Array<{ externalProductCode: string }>>`
      SELECT "externalProductCode"
      FROM "ProviderProductMapping"
      WHERE "organizationId" = ${input.organizationId}
        AND "providerKey" = ${normalizeProviderKey(input.providerKey)}
        AND "productId" = ${input.productId}
      LIMIT 1
    `

    return rows[0]?.externalProductCode || null
  } catch {
    return null
  }
}

function escapeTemplateValue(value: unknown) {
  if (value === null || value === undefined) return ""
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export function renderProviderRequestBody(template: ProviderTemplate, values: Record<string, unknown>) {
  const rendered = template.requestTemplate.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    return escapeTemplateValue(values[key])
  })

  try {
    return JSON.parse(rendered)
  } catch {
    return {
      orderId: values.orderId,
      productId: values.productId,
      externalProductCode: values.externalProductCode,
      network: values.network,
      phone: values.phone,
      quantity: values.quantity,
      amount: values.amount,
    }
  }
}

export function buildProviderAuthHeaders(template: ProviderTemplate, apiKey: string | null) {
  if (!apiKey || template.authType === "NONE") return {}

  if (template.authType === "API_KEY") {
    return { [template.authHeader || "x-api-key"]: apiKey }
  }

  const prefix = template.authPrefix || "Bearer"
  return { [template.authHeader || "Authorization"]: `${prefix} ${apiKey}`.trim() }
}

function getByPath(payload: unknown, path: string) {
  if (!payload || typeof payload !== "object") return undefined

  return path.split(".").reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== "object") return undefined
    return (acc as Record<string, unknown>)[part]
  }, payload)
}

export function readProviderReference(payload: unknown, template: ProviderTemplate) {
  const value =
    getByPath(payload, template.referencePath) ??
    getByPath(payload, "externalRef") ??
    getByPath(payload, "reference") ??
    getByPath(payload, "data.reference")

  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function readProviderMessage(payload: unknown, template: ProviderTemplate) {
  const value = getByPath(payload, template.messagePath) ?? getByPath(payload, "message") ?? getByPath(payload, "data.message")
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function readProviderStatus(payload: unknown, template: ProviderTemplate): "PENDING" | "COMPLETED" | "FAILED" {
  const raw = getByPath(payload, template.statusPath) ?? getByPath(payload, "status") ?? getByPath(payload, "data.status")
  const normalized = String(raw || "").trim().toUpperCase()

  if (template.statusMap.completed.map((v) => v.toUpperCase()).includes(normalized)) return "COMPLETED"
  if (template.statusMap.failed.map((v) => v.toUpperCase()).includes(normalized)) return "FAILED"
  return "PENDING"
}
