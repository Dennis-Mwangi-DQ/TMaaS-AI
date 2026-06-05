import Stripe from 'stripe';
import { getEnv, isConfigured } from './env';

export const hasStripeConfig = isConfigured('STRIPE_SECRET_KEY');

let stripeSingleton: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  if (!hasStripeConfig) {
    return null;
  }

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(getEnv('STRIPE_SECRET_KEY')!, {
      apiVersion: '2025-08-27.basil',
    });
  }

  return stripeSingleton;
}

export const stripe = getStripeClient();
