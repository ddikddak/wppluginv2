import type { AgencyPayload, AgencyMessage } from './backendHandler';

type PaletteIntroArgs = {
  brandName?: string;
  industry?: string;
  vibe?: string;
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
};

export function createPaletteIntroPayload({ brandName, industry, vibe }: PaletteIntroArgs): AgencyPayload {
  const context: Record<string, string> = {};

  const trimmedBrand = brandName?.trim();
  const trimmedIndustry = industry?.trim();
  const trimmedVibe = vibe?.trim();

  if (trimmedBrand) context.brandName = trimmedBrand;
  if (trimmedIndustry) context.industry = trimmedIndustry;
  if (trimmedVibe) context.vibe = trimmedVibe;

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

  return {
    recipient_agent: 'ColorPaletteSelector',
    message,
    chat_history: [],
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

