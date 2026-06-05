const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")

function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName)
  if (!fs.existsSync(filePath)) return

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue

    const index = trimmed.indexOf("=")
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(".env")
loadEnvFile(".env.local")

const db = new PrismaClient()

function generatedPassword() {
  return crypto.randomBytes(18).toString("base64url")
}

async function main() {
  const email = (process.env.SEED_SUPERADMIN_EMAIL || process.env.SUPERADMIN_EMAIL || "admin@techdalt.com").trim().toLowerCase()
  const name = (process.env.SEED_SUPERADMIN_NAME || process.env.SUPERADMIN_NAME || "Techdalt Super Admin").trim()
  const password = process.env.SEED_SUPERADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD || generatedPassword()
  const passwordWasGenerated = !process.env.SEED_SUPERADMIN_PASSWORD && !process.env.SUPERADMIN_PASSWORD

  if (!email.includes("@")) {
    throw new Error("SEED_SUPERADMIN_EMAIL must be a valid email address.")
  }

  if (password.length < 12) {
    throw new Error("SEED_SUPERADMIN_PASSWORD must be at least 12 characters.")
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  const result = await db.$transaction(async (tx) => {
    const before = await tx.user.count()

    await tx.userPricingProfileAssignment.deleteMany({})
    await tx.resellerPrice.deleteMany({})
    await tx.resellerStorefrontPrice.deleteMany({})
    await tx.walletTransaction.deleteMany({})
    await tx.withdrawalRequest.deleteMany({})
    await tx.passwordResetToken.deleteMany({})
    await tx.verificationToken.deleteMany({})

    await tx.user.deleteMany({})

    const user = await tx.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: "SUPERADMIN",
        active: true,
        signupStatus: "APPROVED",
        emailVerified: new Date(),
        emailVerificationRequired: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    })

    const after = await tx.user.count()
    return { before, after, user }
  }, { maxWait: 10000, timeout: 60000 })

  console.log("User cleanup complete.")
  console.log(`Deleted users: ${result.before}`)
  console.log(`Remaining users: ${result.after}`)
  console.log("")
  console.log("SUPERADMIN seeded:")
  console.log(`  Email: ${result.user.email}`)
  console.log(`  Name: ${result.user.name}`)
  console.log(`  Role: ${result.user.role}`)
  console.log(`  Password: ${password}`)
  if (passwordWasGenerated) {
    console.log("")
    console.log("A strong password was generated because no SEED_SUPERADMIN_PASSWORD/SUPERADMIN_PASSWORD was set.")
  }
}

main()
  .catch((error) => {
    console.error("Reset failed:", error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
