import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"

export async function getSettingsContext() {
  const session = await auth()
  if (!session?.user?.email) redirect("/login")

  return db.user.findUnique({
    where: { email: session.user.email },
    include: {
      organization: {
        include: {
          apiKeys: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  })
}
