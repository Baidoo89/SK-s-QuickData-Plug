import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { formatGhanaCedis } from "@/lib/currency"

type Sale = {
  id: string
  name: string
  email: string
  amount: number
}

export function RecentSales({ sales }: { sales: Sale[] }) {
  return (
    <div className="space-y-8">
      {sales.map((sale) => (
        <div key={sale.id} className="flex items-center">
          <Avatar className="h-9 w-9">
            <AvatarImage src={`https://avatar.vercel.sh/${sale.email}`} alt="Avatar" />
            <AvatarFallback>{sale.name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="ml-4 space-y-1">
            <p className="text-sm font-medium leading-none">{sale.name}</p>
            <p className="text-sm text-muted-foreground">
              {sale.email}
            </p>
          </div>
          <div className="ml-auto font-medium">+{formatGhanaCedis(sale.amount)}</div>
        </div>
      ))}
      {sales.length === 0 && (
        <div className="text-center text-sm text-muted-foreground">
          No recent sales.
        </div>
      )}
    </div>
  )
}
