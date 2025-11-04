import { describe, it, expect } from 'vitest';
import { createPaletteRefinementPayload } from '../src/utils/agencyPayloads';
import type { AgencyMessage } from '../src/utils/backendHandler';

describe('createPaletteRefinementPayload', () => {
  const emptyHistory: AgencyMessage[] = [];

  it('includes normalized palette details and context', () => {
    const { payload, inputText, userDisplay, normalizedPalette } = createPaletteRefinementPayload({
      prompt: 'Lean into sunrise hues with warm accents',
      paletteHexes: ['blue', '#ff9900', ' #112233 '],
      brandName: 'Aurora',
      industry: 'Travel',
      vibe: 'Luxury',
      chatHistory: emptyHistory,
    });

    expect(normalizedPalette).toEqual(['#0000FF', '#FF9900', '#112233']);
    expect(inputText).toContain('Lean into sunrise hues with warm accents');
    expect(inputText).toContain('current palette: #0000FF, #FF9900, #112233');
    expect(inputText).toContain('brand: Aurora');
    expect(inputText).toContain('industry: Travel');
    expect(inputText).toContain('vibe: Luxury');
    expect(userDisplay).toBe('Lean into sunrise hues with warm accents');

    expect(payload.recipient_agent).toBe('ColorPaletteSelector');
    expect(payload.input).toBe(inputText);
    expect(payload.structured_output).toBe(true);
    expect(payload.params).toEqual({ output: 'color_palette', format: 'json' });
    expect(payload.chat_history).toEqual([
      { role: 'user', content: inputText },
    ]);
    expect(payload.context).toEqual({
      brandName: 'Aurora',
      industry: 'Travel',
      vibe: 'Luxury',
      palette: '#0000FF, #FF9900, #112233',
    });
  });

  it('gracefully handles missing prompt and palette', () => {
    const { payload, inputText, userDisplay, normalizedPalette } = createPaletteRefinementPayload({
      prompt: '   ',
      paletteHexes: ['   '],
      brandName: '',
      industry: '',
      vibe: '',
      chatHistory: emptyHistory,
    });

    expect(normalizedPalette).toEqual([]);
    expect(inputText).toBe('');
    expect(userDisplay).toBe('');
    expect(payload.input).toBe('');
    expect(payload.context).toEqual({});
    expect(payload.chat_history).toEqual(emptyHistory);
  });

  it('filters invalid palette entries and uppercases short hex codes', () => {
    const { payload, inputText, normalizedPalette, userDisplay } = createPaletteRefinementPayload({
      prompt: '',
      paletteHexes: ['#abc', 'unknown'],
      brandName: 'TestCo',
      industry: 'Retail',
      vibe: '',
      chatHistory: emptyHistory,
    });

    expect(normalizedPalette).toEqual(['#ABC']);
    expect(inputText).toBe('current palette: #ABC. brand: TestCo. industry: Retail');
    expect(userDisplay).toBe('current palette: #ABC. brand: TestCo. industry: Retail');
    expect(payload.context).toEqual({
      brandName: 'TestCo',
      industry: 'Retail',
      palette: '#ABC',
    });
    expect(payload.chat_history).toEqual([
      { role: 'user', content: inputText },
    ]);
  });
});


