import { describe, it, expect } from 'vitest';
import { createPaletteIntroPayload } from '../src/utils/agencyPayloads';

describe('createPaletteIntroPayload', () => {
  it('builds SSE payload with brand context', () => {
    const payload = createPaletteIntroPayload({
      brandName: 'MyBrand',
      industry: 'supplements',
      vibe: 'modern wellness',
    });

    expect(payload.recipient_agent).toBe('ColorPaletteSelector');
    expect(payload.chat_history).toEqual([]);
    expect(payload.context).toEqual({
      brandName: 'MyBrand',
      industry: 'supplements',
      vibe: 'modern wellness',
    });
    expect(payload.file_ids).toBeNull();
    expect(payload.file_urls).toBeNull();
    expect(payload.additional_instructions).toBeNull();
    expect(payload.message).toMatch(/brand colors/i);
    expect(payload.message).toMatch(/logos and labels/i);
    expect(payload.message).toMatch(/blue, green, yellow/i);
  });

  it('omits empty context fields from payload', () => {
    const payload = createPaletteIntroPayload({
      brandName: '',
      industry: '',
      vibe: '',
    });

    expect(payload.context).toEqual({});
  });
});

