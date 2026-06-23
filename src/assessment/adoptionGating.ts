import type { ConversationTurn } from '../types';

const ADOPTION_KEYWORDS = [
  'adoption',
  'change management',
  'training',
  'buy-in',
  'buy in',
  'workforce',
  'digital literacy',
  'champion',
  'resistance',
  'onboard',
];

export function conversationHasAdoptionEvidence(
  conversationHistory: ConversationTurn[],
): boolean {
  const text = conversationHistory
    .map((turn) => turn.content)
    .join(' ')
    .toLowerCase();

  return ADOPTION_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function canScoreAdoptionConditions(
  topicsCompleted: string[],
  conversationHistory: ConversationTurn[],
): { allowed: boolean; reason?: string } {
  if (!topicsCompleted.includes('People')) {
    return {
      allowed: false,
      reason: 'Mark the People topic complete only after asking a dedicated adoption question covering workforce readiness, change management, and manager buy-in.',
    };
  }

  if (!conversationHasAdoptionEvidence(conversationHistory)) {
    return {
      allowed: false,
      reason: 'Ask a dedicated adoption question before scoring adoption_conditions. Cover workforce readiness, change management, and manager buy-in.',
    };
  }

  return { allowed: true };
}
