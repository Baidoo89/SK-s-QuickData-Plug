import { expect, it } from "vitest"
import { getNextBillingDate } from "@/lib/subscription-access"
it("clamps a monthly billing date to the last valid day instead of skipping February", () => {
  expect(getNextBillingDate(new Date("2030-01-31T12:34:56Z"))).toEqual(new Date("2030-02-28T12:34:56Z"))
  expect(getNextBillingDate(new Date("2032-01-31T12:34:56Z"))).toEqual(new Date("2032-02-29T12:34:56Z"))
})
it("rejects invalid billing periods", () => {
  expect(() => getNextBillingDate(new Date("2030-01-15T12:00:00Z"), 0)).toThrow("INVALID_BILLING_PERIOD")
  expect(() => getNextBillingDate(new Date("2030-01-15T12:00:00Z"), 0.5)).toThrow("INVALID_BILLING_PERIOD")
})
