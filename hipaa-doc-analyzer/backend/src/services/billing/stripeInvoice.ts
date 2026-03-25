import Stripe from 'stripe';

const secret = process.env.STRIPE_SECRET_KEY?.trim();

function stripe(): Stripe | null {
  if (!secret) return null;
  return new Stripe(secret);
}

/**
 * Create invoice items, finalize invoice, charge default payment method on file.
 * Returns Stripe invoice id.
 */
export async function chargeAllocatedAwsUsage(params: {
  stripeCustomerId: string;
  amountUsd: number;
  description: string;
}): Promise<string> {
  const s = stripe();
  if (!s) throw new Error('STRIPE_SECRET_KEY is not set');

  const amountCents = Math.round(params.amountUsd * 100);
  if (amountCents < 1) {
    throw new Error('Amount must be at least $0.01');
  }

  await s.invoiceItems.create({
    customer: params.stripeCustomerId,
    amount: amountCents,
    currency: 'usd',
    description: params.description
  });

  const invoice = await s.invoices.create({
    customer: params.stripeCustomerId,
    collection_method: 'charge_automatically',
    auto_advance: true
  });

  const finalized = await s.invoices.finalizeInvoice(invoice.id!);
  return finalized.id!;
}
