export function getSubscriptionPaystackSecret() {
  return process.env.PAYSTACK_SUBSCRIPTION_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY
}

export function getWalletPaystackSecret() {
  return process.env.PAYSTACK_WALLET_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY
}
