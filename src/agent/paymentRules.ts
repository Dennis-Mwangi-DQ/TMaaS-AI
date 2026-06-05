import type { PaymentRule, Service } from '../types';

export function resolvePaymentRule(
  service: Service,
  bookingType: 'single' | 'consultation' | 'package_first_session' = 'single',
): PaymentRule {
  if (bookingType === 'consultation') {
    return { paymentType: 'free', depositAmountAed: 0, balanceDueAed: 0 };
  }

  if (bookingType === 'package_first_session') {
    return {
      paymentType: 'package',
      depositAmountAed: service.priceAed,
      balanceDueAed: 0,
    };
  }

  if (service.priceAed <= 1000) {
    return { paymentType: 'full_upfront', depositAmountAed: service.priceAed, balanceDueAed: 0 };
  }

  const deposit = Math.ceil(service.priceAed * 0.2);
  return {
    paymentType: 'deposit',
    depositAmountAed: deposit,
    balanceDueAed: service.priceAed - deposit,
  };
}
