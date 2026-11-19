import { z } from "zod"

const amount = z.number().finite().min(0, "Price must be zero or more")
const productFields = {
  name: z.string().trim().min(1, "Product name is required"),
  description: z.string(),
  price: amount,
  basePrice: amount,
  storefrontPrice: amount,
  stock: z.number().int().min(0).max(2147483647),
  imageUrl: z.union([z.string().url(), z.literal(""), z.null()]),
  provider: z.string().trim().min(1, "Provider is required"),
  bundleType: z.string().trim().min(1, "Bundle type is required"),
  category: z.string().trim().min(1, "Category is required"),
  serviceForm: z.string().nullable(),
  active: z.boolean(),
}

export const createProductSchema = z.object({
  ...productFields,
  description: productFields.description.default(""),
  basePrice: amount.optional(),
  storefrontPrice: amount.optional(),
  stock: productFields.stock.default(0),
  imageUrl: productFields.imageUrl.default(""),
  provider: productFields.provider.default("MTN"),
  bundleType: productFields.bundleType.default("DATA"),
  category: productFields.category.default("DATA_BUNDLE"),
  serviceForm: productFields.serviceForm.optional(),
  active: productFields.active.default(true),
})

// No update defaults: omitted prices and settings retain their existing values,
// including the absence of explicit base/shop-price records.
export const updateProductSchema = z.object(productFields).partial().refine(
  values => Object.keys(values).length > 0,
  { message: "Provide at least one product field to update" },
)

export function pricingValidationError(input: { basePrice?: number; storefrontPrice?: number }) {
  if (
    input.basePrice !== undefined &&
    input.storefrontPrice !== undefined &&
    input.storefrontPrice < input.basePrice
  ) {
    return "Shop price cannot be below the base price."
  }
  return null
}
