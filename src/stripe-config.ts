// Stripe product configuration
export const STRIPE_PRODUCTS = {
  ms2: {
    priceId: 'price_1234567890', // Replace with your actual Stripe price ID
    name: 'Service Payment',
    description: 'Pay the seller',
    mode: 'payment' as const,
  },
} as const;

export type ProductKey = keyof typeof STRIPE_PRODUCTS;