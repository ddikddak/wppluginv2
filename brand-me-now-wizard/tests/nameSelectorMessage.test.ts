import { describe, it, expect } from 'vitest';
import { composeNameSelectorMessage } from '../src/utils/agencyPayloads';

describe('composeNameSelectorMessage', () => {
  it('combines prompt and brand context for the NameSelector agent', () => {
    const message = composeNameSelectorMessage({
      prompt: 'Need short playful names that feel premium',
      brandName: 'GlowCo',
      industry: 'beauty',
      vibe: 'luxury wellness',
      instagram: 'glow.co',
    });

    expect(message).toMatch(/Need short playful names that feel premium/);
    expect(message).toContain('seed: GlowCo');
    expect(message).toContain('vibe: luxury wellness');
    expect(message).toContain('industry: beauty');
    expect(message).toContain('audience: glow.co');
  });

  it('returns empty string when no context is provided', () => {
    expect(composeNameSelectorMessage({})).toBe('');
  });
});

