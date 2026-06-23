export function normalizeOrgName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function extractOrganisationFromDocument(rawText: string): string | undefined {
  const head = rawText.slice(0, 2000);
  const patterns = [
    /(?:organisation|organization|company|employer)\s*[:\-]\s*([^\n\r]{2,120})/i,
    /prepared\s+for\s*[:\-]?\s*([^\n\r]{2,120})/i,
    /client\s*[:\-]\s*([^\n\r]{2,120})/i,
  ];

  for (const pattern of patterns) {
    const match = head.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const firstLine = head.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 2);
  if (firstLine && firstLine.length <= 80 && !/evidence|assessment|readiness|report/i.test(firstLine)) {
    return firstLine;
  }

  return undefined;
}

export function organisationsMismatch(
  sessionOrganisation: string | undefined,
  documentOrganisation: string | undefined,
): boolean {
  if (!sessionOrganisation || !documentOrganisation) {
    return false;
  }

  const sessionNorm = normalizeOrgName(sessionOrganisation);
  const documentNorm = normalizeOrgName(documentOrganisation);
  if (!sessionNorm || !documentNorm) {
    return false;
  }

  if (sessionNorm === documentNorm) {
    return false;
  }

  return !sessionNorm.includes(documentNorm) && !documentNorm.includes(sessionNorm);
}
