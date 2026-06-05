import { describe, expect, it } from 'vitest';
import { resolvePaymentRule } from '../src/agent/paymentRules';
import { DEMO_SERVICES } from '../src/lib/demoData';
import { queryAvailability } from '../src/tools/availability';

describe('tool helpers', () => {
  it('resolves a deposit rule for higher-priced services', () => {
    const service = DEMO_SERVICES.find((item) => item.name === 'Profhilo')!;
    const result = resolvePaymentRule(service, 'single');
    expect(result.paymentType).toBe('deposit');
    expect(result.depositAmountAed).toBeGreaterThan(0);
  });

  it('returns fallback availability without Supabase', async () => {
    const slots = await queryAvailability({
      serviceId: DEMO_SERVICES[0]!.id,
      branchId: 'br-dxb',
      date: '2026-06-06',
    });

    expect(slots.success).toBe(true);
    expect(slots.data?.length).toBeGreaterThan(0);
  });
});
