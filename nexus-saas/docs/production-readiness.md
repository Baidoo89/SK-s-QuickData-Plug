# Production Readiness

This project can be tested locally before buying Render or a domain. Keep using:

- `NEXTAUTH_URL=http://localhost:3000`
- Neon free database
- Paystack test keys
- Resend disabled or unverified while email links print in the server console

## Local Testing Env

Required in `.env.local`:

```env
NEXTAUTH_URL=http://localhost:3000
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_SECRET=strong-random-value
AUTH_SECRET=strong-random-value
PAYMENT_SETTINGS_ENCRYPTION_KEY=strong-random-value
DATABASE_URL=your-neon-url
PAYSTACK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_xxx
```

If `RESEND_API_KEY` is not set, password reset and email verification links are printed in the dev server console.

## Render Production Settings

Use Render paid web service when ready.

Build command:

```bash
npm install && npx prisma migrate deploy && npm run build
```

Start command:

```bash
npm start
```

Health check path:

```txt
/api/health
```

Strict readiness check:

```txt
/api/readiness
```

## Production Env Vars

Set these on Render:

```env
DATABASE_URL=your-neon-or-production-postgres-url
NEXTAUTH_URL=https://app.yourdomain.com
APP_URL=https://app.yourdomain.com
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
NEXTAUTH_SECRET=strong-random-value
AUTH_SECRET=strong-random-value
PAYMENT_SETTINGS_ENCRYPTION_KEY=strong-random-value
PAYSTACK_SECRET_KEY=sk_live_xxx
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_live_xxx
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=no-reply@yourdomain.com
```

Optional provider/dispatch env vars:

```env
PROVIDER_ORDER_URL=https://provider.example.com/orders
PROVIDER_API_KEY=provider-secret
PROVIDER_WEBHOOK_SECRET=webhook-secret
PROVIDER_WEBHOOK_HMAC_SECRET=hmac-secret
DISPATCH_MODE=HYBRID
DISPATCH_API_NETWORKS=MTN
```

## Domain Flow

1. Buy domain.
2. Put DNS in Cloudflare.
3. Add `app.yourdomain.com` to Render custom domains.
4. Add Render CNAME in Cloudflare.
5. Set Cloudflare SSL to Full or Full strict after Render SSL is active.
6. Update `NEXTAUTH_URL`, `APP_URL`, and `NEXT_PUBLIC_APP_URL` to the live domain.
7. Verify your domain in Resend.
8. Set `RESEND_FROM_EMAIL=no-reply@yourdomain.com`.

## Go-Live Checklist

- `/api/health` returns `ok: true`.
- `/api/readiness` has no missing required env vars.
- Subscriber signup sends or logs verification email.
- Email verification link works.
- Subscriber login without active subscription lands on `/dashboard/subscription?welcome=1`.
- Subscriber can access setup/settings while unpaid, but selling stays blocked until subscription is active.
- Forgot password link works.
- Login works after verification.
- Agent signup creates pending request.
- Subscriber approval page can approve/reject agent.
- Reseller signup creates pending request.
- Agent approval page can approve/reject reseller.
- Storefront `/shop/...` opens.
- Paystack test checkout returns to the storefront.
- Orders enter paid pending fulfillment after successful payment.
- Manual status changes work in Orders.
- `npx tsc --noEmit`, `npm run lint`, and `npx next build` pass.
