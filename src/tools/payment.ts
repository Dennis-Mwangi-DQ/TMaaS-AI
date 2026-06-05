import { z } from 'zod';
import { supabase } from '../db/supabaseClient';
import { stripe } from '../lib/stripeClient';
import { fail, ok } from '../lib/result';
import type { ToolResult } from '../types';

const PaymentParams = z.object({
  bookingRef: z.string().min(1),
  amountAed: z.number().positive(),
  paymentType: z.enum(['full_upfront', 'deposit', 'package']),
  description: z.string().min(1),
});

export async function generatePaymentLink(params: {
  bookingRef: string;
  amountAed: number;
  paymentType: 'full_upfront' | 'deposit' | 'package';
  description: string;
}): Promise<ToolResult<{ paymentLink: string }>> {
  const parsed = PaymentParams.safeParse(params);
  if (!parsed.success) {
    return fail('invalid_payment_params');
  }

  try {
    let paymentLink = `https://payments.browz.test/${encodeURIComponent(params.bookingRef)}`;

    if (stripe) {
      const paymentLinkResponse = await stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency: 'aed',
              product_data: {
                name: params.description,
              },
              unit_amount: Math.round(params.amountAed * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          bookingRef: params.bookingRef,
          paymentType: params.paymentType,
        },
      });

      paymentLink = paymentLinkResponse.url;
    }

    if (supabase) {
      await supabase
        .from('bookings')
        .update({
          payment_link: paymentLink,
          payment_status: 'link_sent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.bookingRef);
    }

    return ok({ paymentLink });
  } catch (error) {
    console.error('generatePaymentLink failed', error);
    return fail('payment_link_failed');
  }
}
