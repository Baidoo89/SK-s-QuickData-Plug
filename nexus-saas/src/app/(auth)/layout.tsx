export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,hsl(var(--blue-ice))/40,transparent_35%),radial-gradient(circle_at_bottom_right,hsl(218_92%_48%_/_0.05),transparent_40%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--background)))] relative overflow-hidden">
      {/* Ambient backdrop blur effect */}
      <div className="absolute inset-0 backdrop-blur-sm" />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}
