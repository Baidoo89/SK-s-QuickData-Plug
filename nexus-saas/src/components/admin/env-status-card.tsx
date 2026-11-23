import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function EnvStatusCard({ label, envKey, description }: { label: string; envKey: string; description?: string }) {
  const isSet = Boolean(process.env[envKey]?.trim())

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex min-w-0 items-center justify-between gap-2 text-sm font-medium">
          <span className="truncate">{label}</span>
          <Badge variant="secondary" className={isSet ? "status-success shrink-0 border text-xs" : "shrink-0 text-xs"}>{isSet ? "Set" : "Missing"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        <p className="break-all font-mono text-[11px] text-muted-foreground">{envKey}</p>
      </CardContent>
    </Card>
  )
}
