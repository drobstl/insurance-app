import Stripe from 'stripe';

// Lazy initialization to avoid errors during build time
let stripeInstance: Stripe | null = null;

export const getStripe = () => {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      console.error('STRIPE_SECRET_KEY is not set in environment variables');
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    stripeInstance = new Stripe(secretKey, {
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return stripeInstance;
};

// For backwards compatibility - will throw if used during build
export const stripe = {
  get customers() { return getStripe().customers; },
  get checkout() { return getStripe().checkout; },
  get subscriptions() { return getStripe().subscriptions; },
  get billingPortal() { return getStripe().billingPortal; },
  get webhooks() { return getStripe().webhooks; },
  // Added for the in-app upgrade flow (/api/stripe/upgrade-tier):
  // paymentMethods.retrieve + paymentMethods.list let us detect
  // whether the agent has a card on file (in_app mode) or needs to
  // be sent through Checkout to enter one (checkout mode).
  get paymentMethods() { return getStripe().paymentMethods; },
};

