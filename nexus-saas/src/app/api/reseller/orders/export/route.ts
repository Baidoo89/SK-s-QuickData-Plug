import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true, organizationId: true },
  });

  if (!user || user.role !== "RESELLER" || !user.organizationId) {
    return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const q = searchParams.get("q") || undefined;

  const where: any = {
    organizationId: user.organizationId,
    userId: user.id,
  };

  if (status && status !== "ALL") {
    where.status = status;
  }

  if (from || to) {
    where.createdAt = {};
    if (from) {
      where.createdAt.gte = new Date(from);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  if (q) {
    where.OR = [
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
      { phoneNumber: { contains: q } },
    ];
  }

  const orders = await db.order.findMany({
    where,
    include: {
      customer: true,
      items: {
        include: {
          product: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const header = ["id", "date", "buyer", "email", "phone", "status", "total", "items"];
  const rows = orders.map((order) => {
    const buyerName = order.customer?.name || "Guest";
    const buyerEmail = order.customer?.email || "";
    const itemsSummary = order.items
      .map((item) => {
        const match = item.product.name.match(/\b\d+(?:\.\d+)?\s?(?:GB|MB|KB|TB)\b/i);
        return match ? match[0].replace(/\s+/g, "").toUpperCase() : item.product.name;
      })
      .join("; ");

    return [
      order.id,
      order.createdAt.toISOString(),
      buyerName,
      buyerEmail,
      order.phoneNumber || "",
      order.status,
      order.total.toString(),
      itemsSummary,
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=reseller-orders.csv",
    },
  });
}