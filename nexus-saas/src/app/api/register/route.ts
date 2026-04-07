import { NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { db as prisma } from "@/lib/db"
import { apiSuccess, ApiErrors } from "@/lib/api-response"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password, name, orgName } = body

    if (!email || !password || !name || !orgName) {
      return ApiErrors.BAD_REQUEST("Missing required fields")
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return ApiErrors.CONFLICT("User already exists")
    }

    // Create slug from org name
    const slug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")

    // Check if slug exists
    const existingOrg = await prisma.organization.findUnique({
      where: { slug },
    })

    if (existingOrg) {
      return ApiErrors.CONFLICT("Organization name already taken")
    }

    const hashedPassword = await hash(password, 10)

    // Transaction to create org and user (subscriber)
    const result = await prisma.$transaction(async (tx: any) => {
      const org = await tx.organization.create({
        data: {
          name: orgName,
          slug,
        },
      })

      const user = await tx.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          role: "SUBSCRIBER",
          organizationId: org.id,
        },
      })

      return { org, user }
    })

    return apiSuccess({ message: "User created successfully", user: result.user }, undefined, 201)
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
