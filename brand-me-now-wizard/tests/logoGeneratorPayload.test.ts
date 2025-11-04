import { describe, it, expect } from 'vitest';
import {
  composeLogoGeneratorMessage,
  createLogoGeneratorIntroPayload,
  parseLogoAgentResponse,
  extractLogoAgentStreamMessage,
} from '../src/utils/agencyPayloads';

describe('composeLogoGeneratorMessage', () => {
  it('includes user brief, palette, styles, and brand context', () => {
    const message = composeLogoGeneratorMessage({
      prompt: 'bold geometric icon with layered gradients',
      brandName: 'GlowCo',
      industry: 'wellness',
      vibe: 'modern calm',
      paletteHexes: ['#FFAA00', '#222222'],
      styles: ['Minimal', 'Vintage'],
      typography: 'Sans-serif',
    });

    expect(message).toContain('bold geometric icon with layered gradients');
    expect(message).toMatch(/styles\s*:\s*Minimal, Vintage/i);
    expect(message).toMatch(/palette\s*HEX\s*:\s*#FFAA00, #222222/i);
    expect(message).toMatch(/PRIMARY emphasis/i);
    expect(message).toMatch(/brand\s*:\s*GlowCo/i);
    expect(message).toMatch(/industry\s*:\s*wellness/i);
    expect(message).toMatch(/vibe\s*:\s*modern calm/i);
  });

  it('omits sections that have no data', () => {
    const message = composeLogoGeneratorMessage({
      prompt: 'flat wordmark',
      brandName: 'Nova',
      paletteHexes: [],
      styles: undefined,
      typography: '',
    });

    expect(message).toContain('flat wordmark');
    expect(message).toContain('brand: Nova');
    expect(message).not.toMatch(/styles\s*:/i);
    expect(message).not.toMatch(/palette\s*HEX/i);
  });
});

describe('createLogoGeneratorIntroPayload', () => {
  it('builds a LogoGenerator intro payload with trimmed context', () => {
    const payload = createLogoGeneratorIntroPayload({
      brandName: '  GlowCo  ',
      industry: '  wellness  ',
      vibe: 'sleek',
      paletteHexes: ['#FFAA00', ' #222222 '],
    });

    expect(payload.recipient_agent).toBe('LogoGenerator');
    expect(payload.chat_history).toEqual([]);
    expect(payload.file_ids).toBeNull();
    expect(payload.file_urls).toBeNull();
    expect(payload.additional_instructions).toBeNull();
    expect(payload.context).toEqual({
      brandName: 'GlowCo',
      industry: 'wellness',
      vibe: 'sleek',
      palette: '#FFAA00, #222222',
    });
    expect(payload.message).toMatch(/logo concepts/i);
    expect(payload.message).toMatch(/color palette/i);
  });
});

describe('parseLogoAgentResponse', () => {
  it('extracts brand, message, and URLs from concatenated JSON fragments', () => {
    const raw = '{"brand_name":"didacLabRitual","prompt":"Dolphin icon"}{"message":"Here are logo ideas.","logo_urls":[{"style":"Elegant","url":"https://example.com/a.png"},{"style":"Bold","url":"https://example.com/b.png"},{"style":"Minimalist","url":"https://example.com/c.png"}] }';

    const { brandName, message, logoUrls } = parseLogoAgentResponse(raw);

    expect(brandName).toBe('didacLabRitual');
    expect(message).toBe('Here are logo ideas.');
    expect(logoUrls).toEqual([
      'https://example.com/a.png',
      'https://example.com/b.png',
      'https://example.com/c.png',
    ]);
  });

  it('returns partial data when only brand fragment is present', () => {
    const raw = '{"brand_name":"GlowCo","prompt":"Something"}';

    const { brandName, message, logoUrls } = parseLogoAgentResponse(raw);

    expect(brandName).toBe('GlowCo');
    expect(message).toBe('');
    expect(logoUrls).toEqual([]);
  });

  it('falls back to plain text when JSON is absent', () => {
    const { brandName, message, logoUrls } = parseLogoAgentResponse('Generating logos…');

    expect(brandName).toBe('');
    expect(message).toBe('Generating logos…');
    expect(logoUrls).toEqual([]);
  });
});

describe('extractLogoAgentStreamMessage', () => {
  it('returns empty string until message key is complete', () => {
    const partial = '{"brand_name":"didacLab"';
    expect(extractLogoAgentStreamMessage(partial)).toBe('');

    const mid = '{"brand_name":"didac"}{"message":"Three dolphin';
    expect(extractLogoAgentStreamMessage(mid)).toBe('');
  });

  it('returns decoded message once closing quote arrives', () => {
    const buffer = '{"brand_name":"didacLab"}{"message":"Three dolphin gym logos"}';
    expect(extractLogoAgentStreamMessage(buffer)).toBe('Three dolphin gym logos');
  });

  it('handles escaped quotes inside message', () => {
    const buffer = '{"message":"Say \\"hi\\" now"}';
    expect(extractLogoAgentStreamMessage(buffer)).toBe('Say "hi" now');
  });
});

