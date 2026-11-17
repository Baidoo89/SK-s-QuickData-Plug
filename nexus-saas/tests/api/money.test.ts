import { expect, it } from "vitest"
import { moneyToMinor, minorToMoney, multiplyMoney, subtractMoney } from "@/lib/money"

it("calculates charges and remaining money in exact pesewas", () => {
  expect(multiplyMoney(0.1, 3)).toBe(0.3)
  expect(subtractMoney(0.7, 0.1, 0.2)).toBe(0.4)
  expect(moneyToMinor("123.45")).toBe(12345)
  expect(minorToMoney(-12345)).toBe(-123.45)
})
it("rejects sub-pesewa, non-finite and overflowing amounts", () => {
  for (const value of [1.001, NaN, Infinity, 90071992547410]) expect(() => moneyToMinor(value)).toThrow("INVALID_MONEY")
  expect(() => multiplyMoney(1, 0.5)).toThrow("INVALID_MONEY")
  expect(() => multiplyMoney(90071992547400, 2)).toThrow("INVALID_MONEY")
})
