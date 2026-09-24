import { useStore } from '../store';

/**
 * Every dollar figure in the widget is computed locally from token counts at
 * API list price. That's a real bill only for API-key users. On Pro, Max,
 * Team and Enterprise, usage is included in the plan — Claude Code's own docs
 * say the cost figure "isn't relevant for billing purposes" there — so calling
 * it "spent" tells a $20/seat user they burned $76 today.
 *
 * `subscriptionType` comes from Claude Code's OAuth credentials: present when
 * signed in with a claude.ai plan, null for API keys.
 */
export interface CostCopy {
  /** True when usage is covered by a subscription, not billed per token. */
  included: boolean;
  /** Label beside today's figure, e.g. "API value today". */
  today: string;
  /** Short noun for a dollar figure, e.g. "API value". */
  noun: string;
  /** One-line explanation, or null when the figure is a real bill. */
  note: string | null;
}

export function planName(subscriptionType: string): string {
  const s = subscriptionType.trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function costCopy(subscriptionType: string | null): CostCopy {
  if (!subscriptionType) {
    return { included: false, today: 'spent today', noun: 'estimated spend', note: null };
  }
  return {
    included: true,
    today: 'API value today',
    noun: 'API value',
    note: `Included in your ${planName(subscriptionType)} plan · shown at API list price`,
  };
}

/** `costCopy` for the signed-in account, for components without the snapshot. */
export function useCostCopy(): CostCopy {
  return costCopy(useStore((s) => s.snapshot?.meta.subscriptionType ?? null));
}
