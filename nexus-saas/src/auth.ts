import NextAuth, { getServerSession, type NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { db } from "@/lib/db"
import { authConfig } from "./auth.config"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"

export const authOptions: NextAuthOptions = {
  ...authConfig,
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          const normalizedEmail = email.trim().toLowerCase();
          const user = await db.user.findFirst({
            where: { email: { equals: normalizedEmail, mode: "insensitive" } },
            select: { id: true, email: true, password: true, active: true, signupStatus: true, role: true, name: true, organizationId: true, agentId: true, parentAgentId: true, image: true, emailVerified: true, emailVerificationRequired: true, createdAt: true, updatedAt: true },
          });
          if (!user || !user.password || user.active === false || user.signupStatus !== "APPROVED") return null;
          if (user.emailVerificationRequired && !user.emailVerified) return null;
          const passwordsMatch = await bcrypt.compare(password, user.password);
          if (passwordsMatch) return user;
        }
        return null;
      },
    }),
  ],
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }

export async function auth() {
  return getServerSession(authOptions)
}
