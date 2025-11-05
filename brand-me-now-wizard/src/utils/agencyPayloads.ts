import type { AgencyPayload, AgencyMessage } from './backendHandler';
import { colorMap } from './colorUtils';

type PaletteIntroArgs = {
  brandName?: string;
  industry?: string;
  vibe?: string;
  brandVisionHistory?: AgencyMessage[];
};

type BrandVisionArgs = {
  message: string;
  chatHistory: AgencyMessage[];
  brandName?: string;
  industry?: string;
  vibe?: string;
  instagram?: string;
};

type NameSelectorArgs = {
  prompt?: string;
  brandName?: string;
  industry?: string;
  vibe?: string;
  instagram?: string;
  brandVisionHistory?: AgencyMessage[];
};

type NameIntroArgs = {
  brandName?: string;
  industry?: string;
  vibe?: string;
  instagram?: string;
  brandVisionHistory?: AgencyMessage[];
};

type LogoGeneratorMessageArgs = {
  prompt?: string;
  brandName?: string;
  industry?: string;
  vibe?: string;
  paletteHexes?: string[];
  styles?: string[];
  typography?: string;
};

type LogoGeneratorIntroArgs = {
  brandName?: string;
  industry?: string;
  vibe?: string;
  paletteHexes?: string[];
  brandVisionHistory?: AgencyMessage[];
};

type LogoGeneratorPayloadArgs = {
  message: string;
  chatHistory: AgencyMessage[];
  brandName?: string;
  industry?: string;
  vibe?: string;
  paletteHexes?: string[];
  brandVisionHistory?: AgencyMessage[];
};

type ProductSelectorIntroArgs = {
  brandName?: string;
  industry?: string;
  vibe?: string;
  paletteHexes?: string[];
  brandVisionHistory?: AgencyMessage[];
};

type ProductSelectorPayloadArgs = {
  message: string;
  chatHistory: AgencyMessage[];
  brandName?: string;
  industry?: string;
  vibe?: string;
  paletteHexes?: string[];
  brandVisionHistory?: AgencyMessage[];
};

type MockupGeneratorMessageArgs = {
  prompt?: string;
  brandName?: string;
  industry?: string;
  vibe?: string;
  paletteHexes?: string[];
};

type MockupGeneratorIntroArgs = {
  brandName?: string;
  industry?: string;
  vibe?: string;
  paletteHexes?: string[];
  brandVisionHistory?: AgencyMessage[];
};

type MockupGeneratorPayloadArgs = {
  message: string;
  chatHistory: AgencyMessage[];
  brandName?: string;
  industry?: string;
  vibe?: string;
  paletteHexes?: string[];
  brandVisionHistory?: AgencyMessage[];
  selectedSkus?: string[];
  selectedLogoUrl?: string;
};

type PaletteRefinementArgs = {
  prompt?: string;
  paletteHexes?: string[];
  brandName?: string;
  industry?: string;
  vibe?: string;
  chatHistory: AgencyMessage[];
  brandVisionHistory?: AgencyMessage[];
};

export function createPaletteIntroPayload({ brandName, industry, vibe, brandVisionHistory }: PaletteIntroArgs): AgencyPayload {
  const context: Record<string, string> = {};

  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();

  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;

  // Extract BrandVision user inputs and add to context
  if (Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0) {
    const brandVisionInputs = brandVisionHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .filter(Boolean)
      .join(' ');
    if (brandVisionInputs) {
      context.brandVision = brandVisionInputs;
    }
  }

  const instructions: string[] = [
    'You are acting as a color palette expert for a branding wizard.',
    'Write a short, upbeat introduction (one to two sentences) inviting the user to choose their brand colors during this color palette selection step.',
    'Explain that the selected colors will influence the brand\'s logos and labels.',
    'Invite the user to pick from suggested palettes or enter their own colors, for example: "blue, green, yellow".',
    'Keep the tone friendly, confident, and focused on brand impact.',
  ];

  if (trimmedBrand) instructions.push(`The brand name is ${trimmedBrand}.`);
  if (trimmedIndustry) instructions.push(`The industry is ${trimmedIndustry}.`);
  if (trimmedVibe) instructions.push(`The desired vibe is ${trimmedVibe}.`);

  const message = instructions.join(' ');

  // Include BrandVision history if available
  const chat_history = Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0
    ? [...brandVisionHistory]
    : [];

  return {
    recipient_agent: 'ColorPaletteSelector',
    message,
    chat_history,
    context,
    file_ids: null,
    file_urls: null,
    additional_instructions: null,
  };
}

export function createBrandVisionPayload({ message, chatHistory, brandName, industry, vibe, instagram }: BrandVisionArgs): AgencyPayload {
  const context: Record<string, string> = {};
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const trimmedIg = instagram?.trim();

  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;
  if (trimmedIg) context.instagram = trimmedIg;

  const baseMessage = message?.trim() ? message : 'Describe the brand vision based on the provided context.';

  return {
    recipient_agent: 'BrandVision',
    message: baseMessage,
    chat_history: chatHistory,
    context,
    file_ids: null,
    file_urls: null,
    additional_instructions: null,
  };
}

export function composeNameSelectorMessage({ prompt, brandName, industry, vibe, instagram }: NameSelectorArgs): string {
  const parts: string[] = [];
  const trimmedPrompt = prompt?.trim();
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const trimmedIg = instagram?.trim();

  if (trimmedPrompt) parts.push(trimmedPrompt);
  if (trimmedBrand) parts.push(`seed: ${trimmedBrand}`);
  if (trimmedVibe) parts.push(`vibe: ${trimmedVibe}`);
  if (trimmedIndustry) parts.push(`industry: ${trimmedIndustry}`);
  if (trimmedIg) parts.push(`audience: ${trimmedIg}`);

  return parts.join('. ').trim();
}

export function createNameIntroPayload({ brandName, industry, vibe, instagram, brandVisionHistory }: NameIntroArgs): AgencyPayload {
  const context: Record<string, string> = {};
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const trimmedIg = instagram?.trim();

  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;
  if (trimmedIg) context.instagram = trimmedIg;

  // Extract BrandVision user inputs and add to context
  if (Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0) {
    const brandVisionInputs = brandVisionHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .filter(Boolean)
      .join(' ');
    if (brandVisionInputs) {
      context.brandVision = brandVisionInputs;
    }
  }

  const introParts = [
    'You are the NameSelector agent for a branding wizard.',
    'Greet the user enthusiastically in one or two sentences and explain that you will brainstorm brand names.',
    'Mention that you automatically check availability and can tailor names based on vibe, industry, or social audience.',
    'Invite the user to share any specific tone, keywords, or constraints before generating name ideas.',
  ];

  if (trimmedBrand) introParts.push(`The current working brand name is ${trimmedBrand}.`);
  if (trimmedIndustry) introParts.push(`The industry is ${trimmedIndustry}.`);
  if (trimmedVibe) introParts.push(`The desired vibe is ${trimmedVibe}.`);
  if (trimmedIg) introParts.push(`The Instagram audience handle is ${trimmedIg}.`);

  const message = introParts.join(' ');

  // Include BrandVision history if available
  const chat_history = Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0
    ? [...brandVisionHistory]
    : [];

  return {
    recipient_agent: 'NameSelector',
    message,
    chat_history,
    context,
    file_ids: null,
    file_urls: null,
    additional_instructions: null,
  };
}

export function createNamePayload({ message, chatHistory, brandName, industry, vibe, instagram, brandVisionHistory }: BrandVisionArgs & { brandVisionHistory?: AgencyMessage[] }): AgencyPayload {
  const context: Record<string, string> = {};
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const trimmedIg = instagram?.trim();

  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;
  if (trimmedIg) context.instagram = trimmedIg;

  // Extract BrandVision user inputs and add to context
  if (Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0) {
    const brandVisionInputs = brandVisionHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .filter(Boolean)
      .join(' ');
    if (brandVisionInputs) {
      context.brandVision = brandVisionInputs;
    }
  }

  const baseMessage = message?.trim() ? message : 'Suggest brand names based on the provided context.';

  // Prepend BrandVision history to chat history
  const brandVision = Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0
    ? [...brandVisionHistory]
    : [];
  const fullChatHistory = [...brandVision, ...chatHistory];

  return {
    recipient_agent: 'NameSelector',
    message: baseMessage,
    chat_history: fullChatHistory,
    context,
    file_ids: null,
    file_urls: null,
    additional_instructions: null,
  };
}

export function composeLogoGeneratorMessage({ prompt, brandName, industry, vibe, paletteHexes, styles, typography }: LogoGeneratorMessageArgs): string {
  const parts: string[] = [];

  const trimmedPrompt = prompt?.trim();
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const trimmedTypography = typography?.trim();
  const normalizedPalette = normalizeHexList(paletteHexes);

  if (trimmedPrompt) parts.push(trimmedPrompt);

  const normalizedStyles = Array.isArray(styles)
    ? styles.map((style) => style?.trim()).filter((style): style is string => Boolean(style))
    : [];
  if (normalizedStyles.length) parts.push(`styles: ${normalizedStyles.join(', ')}`);

  if (trimmedTypography) parts.push(`typography: ${trimmedTypography}`);

  if (normalizedPalette.length) {
    parts.push(`palette HEX: ${normalizedPalette.join(', ')}`);
    const [primary, ...rest] = normalizedPalette;
    if (primary) {
      const secondaryText = rest.length ? rest.join(', ') : 'none';
      parts.push(`PRIMARY emphasis: ${primary} with subtle accents: ${secondaryText}`);
    }
  }

  if (trimmedBrand) parts.push(`brand: ${trimmedBrand}`);
  if (trimmedIndustry) parts.push(`industry: ${trimmedIndustry}`);
  if (trimmedVibe) parts.push(`vibe: ${trimmedVibe}`);

  return parts.join('. ').trim();
}

export function createLogoGeneratorIntroPayload({ brandName, industry, vibe, paletteHexes, brandVisionHistory }: LogoGeneratorIntroArgs): AgencyPayload {
  const context: Record<string, string> = {};
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const normalizedPalette = normalizeHexList(paletteHexes);

  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;
  if (normalizedPalette.length) context.palette = normalizedPalette.join(', ');

  // Extract BrandVision user inputs and add to context
  if (Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0) {
    const brandVisionInputs = brandVisionHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .filter(Boolean)
      .join(' ');
    if (brandVisionInputs) {
      context.brandVision = brandVisionInputs;
    }
  }

  const introParts = [
    'You are the LogoGeneration agent for an interactive branding wizard.',
    'Greet the user warmly in one or two sentences and explain you will help craft custom logo concepts.',
    'Emphasize that the logos will follow the selected color palette and overall brand direction.',
    'Encourage the user to share style cues or edits before you generate the first batch of logos.',
  ];

  if (trimmedBrand) introParts.push(`The brand name is ${trimmedBrand}.`);
  if (trimmedIndustry) introParts.push(`The industry is ${trimmedIndustry}.`);
  if (trimmedVibe) introParts.push(`The vibe is ${trimmedVibe}.`);
  if (normalizedPalette.length) introParts.push(`The color palette includes: ${normalizedPalette.join(', ')}.`);

  const message = introParts.join(' ');

  // Include BrandVision history if available
  const chat_history = Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0
    ? [...brandVisionHistory]
    : [];

  return {
    recipient_agent: 'LogoGenerator',
    message,
    chat_history,
    context,
    file_ids: null,
    file_urls: null,
    additional_instructions: null,
  };
}

export function createLogoGeneratorPayload({ message, chatHistory, brandName, industry, vibe, paletteHexes, brandVisionHistory }: LogoGeneratorPayloadArgs): AgencyPayload {
  const context: Record<string, string> = {};
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const normalizedPalette = normalizeHexList(paletteHexes);

  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;
  if (normalizedPalette.length) context.palette = normalizedPalette.join(', ');

  // Extract BrandVision user inputs and add to context
  if (Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0) {
    const brandVisionInputs = brandVisionHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .filter(Boolean)
      .join(' ');
    if (brandVisionInputs) {
      context.brandVision = brandVisionInputs;
    }
  }

  // Prepend BrandVision history to chat history
  const brandVision = Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0
    ? [...brandVisionHistory]
    : [];
  const fullChatHistory = [...brandVision, ...chatHistory];

  return {
    recipient_agent: 'LogoGenerator',
    message: message?.trim() ?? '',
    chat_history: fullChatHistory,
    context,
    file_ids: null,
    file_urls: null,
    additional_instructions: null,
  };
}

export function createProductSelectorIntroPayload({ brandName, industry, vibe, paletteHexes, brandVisionHistory }: ProductSelectorIntroArgs): AgencyPayload {
  const context: Record<string, string> = {};
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const normalizedPalette = normalizeHexList(paletteHexes);

  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;
  if (normalizedPalette.length) context.palette = normalizedPalette.join(', ');

  // Extract BrandVision user inputs and add to context
  if (Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0) {
    const brandVisionInputs = brandVisionHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .filter(Boolean)
      .join(' ');
    if (brandVisionInputs) {
      context.brandVision = brandVisionInputs;
    }
  }

  const introParts = [
    'You are the ProductSelector agent for an interactive branding wizard.',
    'Greet the user warmly in one or two sentences and explain you will help them select the best product for their brand.',
    'Mention that you can suggest products based on their brand name, industry, vibe, color palette, and other preferences.',
    'Encourage the user to share any product preferences, constraints, or specific requirements.',
  ];

  if (trimmedBrand) introParts.push(`The brand name is ${trimmedBrand}.`);
  if (trimmedIndustry) introParts.push(`The industry is ${trimmedIndustry}.`);
  if (trimmedVibe) introParts.push(`The vibe is ${trimmedVibe}.`);
  if (normalizedPalette.length) introParts.push(`The color palette includes: ${normalizedPalette.join(', ')}.`);

  const message = introParts.join(' ');

  // Include BrandVision history if available
  const chat_history = Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0
    ? [...brandVisionHistory]
    : [];

  return {
    recipient_agent: 'ProductSelector',
    message,
    chat_history,
    context,
    file_ids: null,
    file_urls: null,
    additional_instructions: null,
  };
}

export function createProductSelectorPayload({ message, chatHistory, brandName, industry, vibe, paletteHexes, brandVisionHistory }: ProductSelectorPayloadArgs): AgencyPayload {
  const context: Record<string, string> = {};
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const normalizedPalette = normalizeHexList(paletteHexes);

  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;
  if (normalizedPalette.length) context.palette = normalizedPalette.join(', ');

  // Extract BrandVision user inputs and add to context
  if (Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0) {
    const brandVisionInputs = brandVisionHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .filter(Boolean)
      .join(' ');
    if (brandVisionInputs) {
      context.brandVision = brandVisionInputs;
    }
  }

  const baseMessage = message?.trim() ? message : 'Suggest products based on the provided context.';

  // Prepend BrandVision history to chat history
  const brandVision = Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0
    ? [...brandVisionHistory]
    : [];
  const fullChatHistory = [...brandVision, ...chatHistory];

  return {
    recipient_agent: 'ProductSelector',
    message: baseMessage,
    chat_history: fullChatHistory,
    context,
    file_ids: null,
    file_urls: null,
    additional_instructions: null,
  };
}

export function composeMockupGeneratorMessage({ prompt, brandName, industry, vibe, paletteHexes }: MockupGeneratorMessageArgs): string {
  const parts: string[] = [];

  const trimmedPrompt = prompt?.trim();
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const normalizedPalette = normalizeHexList(paletteHexes);

  if (trimmedPrompt) parts.push(trimmedPrompt);

  if (normalizedPalette.length) {
    parts.push(`palette HEX: ${normalizedPalette.join(', ')}`);
    const [primary, ...rest] = normalizedPalette;
    if (primary) {
      const secondaryText = rest.length ? rest.join(', ') : 'none';
      parts.push(`PRIMARY emphasis: ${primary} with subtle accents: ${secondaryText}`);
    }
  }

  if (trimmedBrand) parts.push(`brand: ${trimmedBrand}`);
  if (trimmedIndustry) parts.push(`industry: ${trimmedIndustry}`);
  if (trimmedVibe) parts.push(`vibe: ${trimmedVibe}`);

  return parts.join('. ').trim();
}

export function createMockupGeneratorIntroPayload({ brandName, industry, vibe, paletteHexes, brandVisionHistory }: MockupGeneratorIntroArgs): AgencyPayload {
  const context: Record<string, string> = {};
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const normalizedPalette = normalizeHexList(paletteHexes);

  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;
  if (normalizedPalette.length) context.palette = normalizedPalette.join(', ');

  // Extract BrandVision user inputs and add to context
  if (Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0) {
    const brandVisionInputs = brandVisionHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .filter(Boolean)
      .join(' ');
    if (brandVisionInputs) {
      context.brandVision = brandVisionInputs;
    }
  }

  const introParts = [
    'You are the MockupGenerator agent for an interactive branding wizard.',
    'Greet the user warmly in one or two sentences and explain you will help generate mockup images.',
    'Emphasize that the mockups will follow the selected color palette and overall brand direction.',
    'Encourage the user to share style cues or preferences before you generate the first batch of mockups.',
  ];

  if (trimmedBrand) introParts.push(`The brand name is ${trimmedBrand}.`);
  if (trimmedIndustry) introParts.push(`The industry is ${trimmedIndustry}.`);
  if (trimmedVibe) introParts.push(`The vibe is ${trimmedVibe}.`);
  if (normalizedPalette.length) introParts.push(`The color palette includes: ${normalizedPalette.join(', ')}.`);

  const message = introParts.join(' ');

  // Include BrandVision history if available
  const chat_history = Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0
    ? [...brandVisionHistory]
    : [];

  return {
    recipient_agent: 'MockupGenerator',
    message,
    chat_history,
    context,
    file_ids: null,
    file_urls: null,
    additional_instructions: null,
  };
}

export function createMockupGeneratorPayload({ message, chatHistory, brandName, industry, vibe, paletteHexes, brandVisionHistory, selectedSkus, selectedLogoUrl }: MockupGeneratorPayloadArgs): AgencyPayload {
  const context: Record<string, string> = {};
  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();
  const normalizedPalette = normalizeHexList(paletteHexes);

  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;
  if (normalizedPalette.length) context.palette = normalizedPalette.join(', ');

  // Add selected SKUs to context
  if (Array.isArray(selectedSkus) && selectedSkus.length > 0) {
    context.selectedSkus = selectedSkus.join(', ');
  }

  // Add selected logo URL to context
  if (selectedLogoUrl?.trim()) {
    context.selectedLogoUrl = selectedLogoUrl.trim();
  }

  // Extract BrandVision user inputs and add to context
  if (Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0) {
    const brandVisionInputs = brandVisionHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .filter(Boolean)
      .join(' ');
    if (brandVisionInputs) {
      context.brandVision = brandVisionInputs;
    }
  }

  // Prepend BrandVision history to chat history
  const brandVision = Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0
    ? [...brandVisionHistory]
    : [];
  const fullChatHistory = [...brandVision, ...chatHistory];

  return {
    recipient_agent: 'MockupGenerator',
    message: message?.trim() ?? '',
    chat_history: fullChatHistory,
    context,
    file_ids: null,
    file_urls: null,
    additional_instructions: null,
  };
}

export function createPaletteRefinementPayload({ prompt, paletteHexes, brandName, industry, vibe, chatHistory, brandVisionHistory }: PaletteRefinementArgs): {
  payload: AgencyPayload;
  inputText: string;
  userDisplay: string;
  normalizedPalette: string[];
} {
  const normalizedPalette = normalizePaletteEntries(paletteHexes);
  const trimmedPrompt = typeof prompt === 'string' ? prompt.trim() : '';
  const trimmedBrand = brandName?.trim() ?? '';
  const trimmedIndustry = industry?.trim() ?? '';
  const trimmedVibe = vibe?.trim() ?? '';

  const parts: string[] = [];
  if (trimmedPrompt) parts.push(trimmedPrompt);
  if (normalizedPalette.length) parts.push(`current palette: ${normalizedPalette.join(', ')}`);
  if (trimmedBrand) parts.push(`brand: ${trimmedBrand}`);
  if (trimmedIndustry) parts.push(`industry: ${trimmedIndustry}`);
  if (trimmedVibe) parts.push(`vibe: ${trimmedVibe}`);

  const inputText = parts.join('. ').trim();
  const userDisplay = trimmedPrompt || inputText;

  const context: Record<string, string> = {};
  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;
  if (normalizedPalette.length) context.palette = normalizedPalette.join(', ');

  // Extract BrandVision user inputs and add to context
  if (Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0) {
    const brandVisionInputs = brandVisionHistory
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .filter(Boolean)
      .join(' ');
    if (brandVisionInputs) {
      context.brandVision = brandVisionInputs;
    }
  }

  // Prepend BrandVision history to base history
  const brandVision = Array.isArray(brandVisionHistory) && brandVisionHistory.length > 0
    ? [...brandVisionHistory]
    : [];
  const baseHistory = Array.isArray(chatHistory) ? chatHistory : [];
  const chat_history = inputText
    ? [...brandVision, ...baseHistory, { role: 'user' as const, content: inputText }]
    : [...brandVision, ...baseHistory];

  const payload: AgencyPayload = {
    recipient_agent: 'ColorPaletteSelector',
    input: inputText,
    chat_history,
    context,
    params: { output: 'color_palette', format: 'json' },
    structured_output: true,
    file_ids: null,
    file_urls: null,
    additional_instructions: null,
  };

  return { payload, inputText, userDisplay, normalizedPalette };
}


function normalizeHexList(hexes?: string[]): string[] {
  if (!Array.isArray(hexes)) return [];

  return hexes
    .map((hex) => (typeof hex === 'string' ? hex.trim() : ''))
    .filter(Boolean)
    .map((hex) => {
      const withoutHash = hex.startsWith('#') ? hex.slice(1) : hex;
      const cleaned = withoutHash.replace(/[^0-9a-fA-F]/g, '');
      if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(cleaned)) {
        return '';
      }
      return `#${cleaned.toUpperCase()}`;
    })
    .filter((hex): hex is string => Boolean(hex));
}

function extractJsonFragments(input: string): string[] {
  if (!input.includes('}{')) {
    return looksLikeJson(input) ? [input] : [];
  }

  const placeholder = '\u0000';
  const replaced = input.replace(/}\s*{/g, `}${placeholder}{`);
  return replaced
    .split(placeholder)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && looksLikeJson(part));
}

function looksLikeJson(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

function pickFirstString(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length) {
        return trimmed;
      }
    }
  }
  return '';
}

function normalizeLogoUrl(entry: unknown): string {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return trimmed.length ? trimmed : '';
  }

  if (!entry || typeof entry !== 'object') {
    return '';
  }

  return pickFirstString(
    (entry as any).url,
    (entry as any).image_url,
    (entry as any).src,
    (entry as any).href,
  );
}

export function extractLogoAgentStreamMessage(buffer: string): string {
  if (!buffer || typeof buffer !== 'string') return '';

  const keyIndex = buffer.indexOf('"message"');
  if (keyIndex === -1) return '';

  const colonIndex = buffer.indexOf(':', keyIndex);
  if (colonIndex === -1) return '';

  let cursor = colonIndex + 1;
  while (cursor < buffer.length && buffer[cursor] !== '"') {
    if (!/\s/.test(buffer[cursor])) {
      return '';
    }
    cursor++;
  }

  if (cursor >= buffer.length || buffer[cursor] !== '"') return '';

  let token = '"';
  let escaped = false;
  for (let i = cursor + 1; i < buffer.length; i++) {
    const ch = buffer[i];
    token += ch;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      try {
        return JSON.parse(token);
      } catch {
        return '';
      }
    }
  }

  return '';
}

export function parseLogoAgentResponse(raw: unknown): { brandName: string; message: string; logoUrls: string[] } {
  const queue: unknown[] = [];
  if (raw !== undefined && raw !== null) {
    queue.push(raw);
  }

  let brandName = '';
  let message = '';
  const logoUrls: string[] = [];
  const seen = new Set<string>();

  while (queue.length) {
    const current = queue.shift();
    if (current === null || current === undefined) continue;

    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (!trimmed) continue;

      const fragments = extractJsonFragments(trimmed);
      if (fragments.length > 1) {
        for (const fragment of fragments) {
          try {
            queue.push(JSON.parse(fragment));
          } catch {
            // ignore malformed fragment
          }
        }
        continue;
      }

      if (looksLikeJson(trimmed)) {
        try {
          queue.push(JSON.parse(trimmed));
          continue;
        } catch {
          // fall through to treat as plain text
        }
      }

      if (!message) {
        message = trimmed;
      }
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current === 'object') {
      const candidate = current as Record<string, unknown>;

      const nested = candidate?.data;
      if (nested && nested !== candidate) queue.push(nested);
      const deepNested = typeof nested === 'object' && nested && (nested as any).data;
      if (deepNested && deepNested !== nested && deepNested !== candidate) queue.push(deepNested);

      if (!brandName) {
        const maybeBrand = pickFirstString(
          candidate.brand_name,
          candidate.brandName,
          candidate.brand,
          (candidate as any)?.data?.brand_name,
          (candidate as any)?.data?.brandName
        );
        if (maybeBrand) brandName = maybeBrand;
      }

      if (!message) {
        const maybeMessage = pickFirstString(
          candidate.message,
          candidate.delta,
          candidate.status,
          candidate.text,
          (candidate as any)?.data?.message,
          (candidate as any)?.data?.delta,
          (candidate as any)?.data?.status
        );
        if (maybeMessage) message = maybeMessage;
      }

      const collections = [
        candidate.logo_urls,
        candidate.logos,
        candidate.images,
        candidate.urls,
        (candidate as any)?.data?.logo_urls,
        (candidate as any)?.data?.logos,
        (candidate as any)?.data?.images,
      ];

      for (const col of collections) {
        if (!Array.isArray(col)) continue;
        for (const entry of col) {
          const normalized = normalizeLogoUrl(entry);
          if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            logoUrls.push(normalized);
          }
        }
      }

      continue;
    }
  }

  return {
    brandName,
    message,
    logoUrls,
  };
}

function normalizePaletteEntries(entries?: string[]): string[] {
  if (!Array.isArray(entries)) return [];

  const results: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    const mapped = colorMap[lower];
    if (mapped) {
      results.push(mapped.toUpperCase());
      continue;
    }
    const normalizedHex = normalizeHexList([trimmed]);
    if (normalizedHex.length) {
      results.push(normalizedHex[0]);
    }
  }

  return Array.from(new Set(results));
}


