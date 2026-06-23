import { describe, it, expect } from 'vitest';
import {
  extractOrganisationFromDocument,
  organisationsMismatch,
  normalizeOrgName,
} from '../src/ingestion/orgDetector';

describe('orgDetector', () => {
  it('extracts organisation from document header patterns', () => {
    const text = 'AI Readiness Evidence Pack\nOrganisation: NoorFresh Trading LLC\nSector: Food & Beverage';
    expect(extractOrganisationFromDocument(text)).toBe('NoorFresh Trading LLC');
  });

  it('detects mismatch between session and document organisations', () => {
    expect(organisationsMismatch('NoorFresh Trading LLC', 'Delta Logistics Ltd')).toBe(true);
    expect(organisationsMismatch('NoorFresh Trading LLC', 'NoorFresh Trading')).toBe(false);
  });

  it('normalizes organisation names for comparison', () => {
    expect(normalizeOrgName('Noor-Fresh Trading LLC')).toBe('noor fresh trading llc');
  });
});

describe('uploadSessionReset', () => {
  it('should reset when completed session org differs from uploaded document org', () => {
    const sessionOrg = 'Acme Retail';
    const documentOrg = extractOrganisationFromDocument('Company: Horizon Healthcare Group');
    expect(organisationsMismatch(sessionOrg, documentOrg)).toBe(true);
  });
});
