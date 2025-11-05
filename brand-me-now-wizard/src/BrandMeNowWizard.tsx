import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Wand2, ChevronRight, ChevronLeft, Sparkles, Check } from "lucide-react";
import { colorMap, parseColors } from './utils/colorUtils';
import { analyzeImageFromUrl, colorDistanceHex, dominantPaletteColor, comparePaletteWithImage } from './utils/colorAnalysis';
import {
  createPaletteIntroPayload,
  createBrandVisionPayload,
  composeLogoGeneratorMessage,
  createLogoGeneratorIntroPayload,
  createLogoGeneratorPayload,
  createNameIntroPayload,
  createNamePayload,
} from './utils/agencyPayloads';
import { postAgencyRespond, streamAgencyRespond, requestAgencyResponse, extractMessageFromSSE } from './utils/backendHandler';
import type { AgencyMessage } from './utils/backendHandler';

// Reusable widgets for agent-driven steps
function AgentIntroWidget({ 
  introMessage, 
  introError, 
  loadingText 
}: { 
  introMessage?: string; 
  introError?: string | null; 
  loadingText?: string;
}) {
  return (
    <div className="mt-6 max-w-3xl mx-auto">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
        {loadingText && (
          <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-400">
            <Sparkles className="h-4 w-4" />
            <span>{loadingText}</span>
          </div>
        )}
        <div className="mt-2 text-sm text-slate-700 whitespace-pre-line min-h-[48px]">
          {introMessage || introError || null}
        </div>
      </div>
    </div>
  );
}

function filterToolCalls(text: string): string {
  if (!text) return text;
  // Replace content inside curly braces with "Thinking"
  // This handles nested braces and multiple occurrences
  return text.replace(/\{[^}]*\}/g, '\nThinking\n\n');
}

function removeFirstToolCall(text: string): string {
  if (!text || typeof text !== 'string') return text;
  
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return text;
  
  let braceCount = 0;
  let endIndex = -1;
  for (let i = firstBrace; i < text.length; i++) {
    if (text[i] === '{') braceCount++;
    if (text[i] === '}') braceCount--;
    if (braceCount === 0) {
      endIndex = i + 1;
      break;
    }
  }
  
  if (endIndex > 0) {
    const firstJson = text.substring(firstBrace, endIndex);
    // Check if this looks like a tool call (contains brand_name, prompt, etc.)
    if (firstJson.includes('"brand_name"') || firstJson.includes('"prompt"') || firstJson.includes('"output_format"')) {
      // Remove the first JSON object and any whitespace after it
      return text.substring(endIndex).trim();
    }
  }
  
  return text;
}

function AgentMessageWidget({ 
  streamingText, 
  finalMessage, 
  loading, 
  loadingText 
}: { 
  streamingText?: string; 
  finalMessage?: string; 
  loading?: boolean;
  loadingText?: string;
}) {
  if (!streamingText && !finalMessage && !loading) return null;
  
  const displayText = finalMessage || streamingText || (loading ? (loadingText || 'Analyzing your brand vision…') : '');
  const filteredText = filterToolCalls(displayText);
  
  return (
    <div className="mt-6">
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="mt-2 text-sm text-slate-700 whitespace-pre-line min-h-[48px]">
          {filteredText}
        </div>
      </div>
    </div>
  );
}

function RefinementWidget({
  refinePrompt,
  onRefinePromptChange,
  onRefine,
  loading,
  placeholder,
  refineButtonText
}: {
  refinePrompt: string;
  onRefinePromptChange: (v: string) => void;
  onRefine: () => void;
  loading: boolean;
  placeholder: string;
  refineButtonText: string;
}) {
  return (
    <div className="mt-6">
      <div className="text-sm font-medium text-slate-700 mb-1">Need revisions?</div>
      <StandardTextInput
        value={refinePrompt}
        onChange={onRefinePromptChange}
        placeholder={placeholder}
        multiline
        maxLength={220}
      />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onRefine}
          disabled={loading || !refinePrompt.trim()}
          className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {refineButtonText}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function BrandMeNowWizard() {
  type Step =
    | "form" | "loading1" | "social" | "loading2" | "name" | "loading3"
    | "palette" | "loading4" | "logo" | "loading5" | "product" | "loading6"
    | "preview" | "loading7" | "profit" | "loading8" | "book" | "done";

  const tips = [
    "Tip: Include details about your audience (e.g., Gen Z wellness) for better personalized results.",
    "Tip: Specify your brand's tone (e.g., professional, fun) for tailored suggestions.",
    "Tip: Add industry details for more relevant ideas.",
    "Tip: Describe your target market size for accurate projections.",
  ];

  const paletteIntroFallback = "Time to pick your brand colors! This will influence your logos and labels. You can choose from examples below or enter your own colors (e.g., 'blue, green, yellow').";
  const paletteIntroLoadingText = "Preparing color guidance…";
  const logoIntroFallback = "Let's craft your logo. Share any style cues and I'll generate options that respect your palette.";

  const [step, setStep] = useState<Step>("form");
  const [user, setUser] = useState({ name: "", email: "", ig: "" });
  const [vibe, setVibe] = useState("");
  const [industry, setIndustry] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandAvailable, setBrandAvailable] = useState<boolean>(false);
  const [paletteColors, setPaletteColors] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [paletteSelected, setPaletteSelected] = useState(false);
  const [customError, setCustomError] = useState("");
  const [logoStyles, setLogoStyles] = useState<string[]>([]);
  const [logoOptions, setLogoOptions] = useState<string[]>([]);
  const [chosenLogo, setChosenLogo] = useState<string | null>(null);
  const [logoOverlay, setLogoOverlay] = useState<{ x:number; y:number; scale:number; bg:'light'|'dark' }>({ x:50, y:50, scale:1, bg:'light' });
  const [iconStyle, setIconStyle] = useState<string>("");
  const [typography, setTypography] = useState<string>("");
  const [logoLoading, setLogoLoading] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<string>("");
  // Agent-driven logo conversation states
  const [logoUserPrompt, setLogoUserPrompt] = useState<string>("");
  const [logoIntroLoading, setLogoIntroLoading] = useState<boolean>(false);
  const [logoIntroMessage, setLogoIntroMessage] = useState<string>("");
  const [logoIntroError, setLogoIntroError] = useState<string | null>(null);
  const [logoAgentMessage, setLogoAgentMessage] = useState<string>("");
  const [logoChatHistory, setLogoChatHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  // Agent-driven palette conversation states
  const [paletteUserPrompt, setPaletteUserPrompt] = useState<string>("");
  const [paletteRefinePrompt, setPaletteRefinePrompt] = useState<string>("");
  const [paletteAgentIntro, setPaletteAgentIntro] = useState<string>("");
  const [paletteIntroMessage, setPaletteIntroMessage] = useState<string>("");
  const [paletteIntroError, setPaletteIntroError] = useState<string | null>(null);
  const [paletteIntroLoading, setPaletteIntroLoading] = useState<boolean>(false);
  const [paletteAgentMessage, setPaletteAgentMessage] = useState<string>("");
  const [paletteStreamingText, setPaletteStreamingText] = useState<string>("");
  const [paletteFinalMessage, setPaletteFinalMessage] = useState<string>("");
  const [paletteChatHistory, setPaletteChatHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [paletteLoading, setPaletteLoading] = useState<boolean>(false);
  const [paletteScanSucceeded, setPaletteScanSucceeded] = useState<boolean>(false);
  // Agent-driven name conversation states
  const [nameUserPrompt, setNameUserPrompt] = useState<string>("");
  const [nameAgentMessage, setNameAgentMessage] = useState<string>("");
  const [nameChatHistory, setNameChatHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [nameLoading, setNameLoading] = useState<boolean>(false);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [nameScanSucceeded, setNameScanSucceeded] = useState<boolean>(false);
  const [nameStreamingText, setNameStreamingText] = useState<string>("");
  const [nameFinalMessage, setNameFinalMessage] = useState<string>("");
  const [nameRefinePrompt, setNameRefinePrompt] = useState<string>("");
  const [nameIntroMessage, setNameIntroMessage] = useState<string>("");
  const [nameIntroLoading, setNameIntroLoading] = useState<boolean>(false);
  const [nameIntroError, setNameIntroError] = useState<string | null>(null);
  // Agent-driven social conversation states (BrandVision)
  const [socialUserPrompt, setSocialUserPrompt] = useState<string>("");
  const [socialAgentIntro, setSocialAgentIntro] = useState<string>("");
  const [socialAgentMessage, setSocialAgentMessage] = useState<string>("");
  const [socialChatHistory, setSocialChatHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [socialLoading, setSocialLoading] = useState<boolean>(false);
  const [socialHelpers, setSocialHelpers] = useState<string[]>([]);
  const [socialIntroMessage, setSocialIntroMessage] = useState<string>("");
  const [socialIntroLoading, setSocialIntroLoading] = useState<boolean>(false);
  const [socialIntroError, setSocialIntroError] = useState<string | null>(null);
  const [socialStreamingText, setSocialStreamingText] = useState<string>("");
  const [socialFinalMessage, setSocialFinalMessage] = useState<string>("");
  const [socialScanSucceeded, setSocialScanSucceeded] = useState<boolean>(false);
  const [socialRefinePrompt, setSocialRefinePrompt] = useState<string>("");
  // Agent-driven product conversation states (ProductAdvisor)
  const [productUserPrompt, setProductUserPrompt] = useState<string>("");
  const [productAgentIntro, setProductAgentIntro] = useState<string>("");
  const [productAgentMessage, setProductAgentMessage] = useState<string>("");
  const [productChatHistory, setProductChatHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [productLoading, setProductLoading] = useState<boolean>(false);
  const [productSuggestions, setProductSuggestions] = useState<Array<{ sku: string; title: string; blurb: string; category: string }>>([]);
  // Agent-driven preview conversation states (PreviewStylist)
  const [previewUserPrompt, setPreviewUserPrompt] = useState<string>("");
  const [previewAgentIntro, setPreviewAgentIntro] = useState<string>("");
  const [previewAgentMessage, setPreviewAgentMessage] = useState<string>("");
  const [previewChatHistory, setPreviewChatHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  // Agent-driven profit conversation states (ProfitEstimator)
  const [profitUserPrompt, setProfitUserPrompt] = useState<string>("");
  const [profitAgentIntro, setProfitAgentIntro] = useState<string>("");
  const [profitAgentMessage, setProfitAgentMessage] = useState<string>("");
  const [profitChatHistory, setProfitChatHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [profitLoading, setProfitLoading] = useState<boolean>(false);
  const [category, setCategory] = useState("supplements");
  const [sku, setSku] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [profit, setProfit] = useState<{ base:number; retail:number; followers:number; conv:number; estUnits?:number; estProfit?:number }>({ base: 10, retail: 29, followers: 5000, conv: 0.02 });
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [showMoreVibes, setShowMoreVibes] = useState(false);
  const [showMoreNames, setShowMoreNames] = useState(false);
  const [showMorePalettes, setShowMorePalettes] = useState(false);
  // Performance caches
  const logoCacheRef = useRef<Map<string, string[]>>(new Map());
  const validationCacheRef = useRef<Map<string, { pass:boolean; score:number }>>(new Map());
  // LeadConnector / GHL calendar embed configuration
  const BOOKING_IFRAME_ID = 'UL9SNgWU3gjlVPKyzTMv_1761906629268';
  const BOOKING_SERVICE_ID = 'UL9SNgWU3gjlVPKyzTMv';
  const BOOKING_IFRAME_SRC = `https://api.leadconnectorhq.com/widget/booking/${BOOKING_SERVICE_ID}?iframeId=${BOOKING_IFRAME_ID}`;


  useEffect(() => {
    let t: any;
    const next: Record<Step, Step> = {
      form: "loading1", loading1: "social", social: "loading2", loading2: "name",
      name: "loading3", loading3: "palette", palette: "loading4", loading4: "logo",
      logo: "loading5", loading5: "product", product: "loading6", loading6: "preview",
      preview: "loading7", loading7: "profit", profit: "loading8", loading8: "book",
      book: "done", done: "done",
    };
    if (step.startsWith("loading")) t = setTimeout(() => setStep(next[step]), 1200);
    return () => clearTimeout(t);
  }, [step]);

  // Show AI-typed intro when entering the logo step
  useEffect(() => {
    if (step === "palette") {
      setPaletteAgentIntro("I can refine your palette to better match your vibe and industry. Describe your desired color direction and click Refine.");
    }
    if (step === "social") {
      setSocialAgentIntro("I'll help summarize your brand vision and audience. Share any details, or let me scan your vibe to suggest directions.");
    }
    if (step === "product") {
      setProductAgentIntro("Need help picking products? Describe your focus or constraints and I'll suggest SKUs that fit your brand.");
    }
    if (step === "preview") {
      setPreviewAgentIntro("I can adjust the mock-up layout automatically. Tell me where to place the logo or the background you prefer.");
    }
    if (step === "profit") {
      setProfitAgentIntro("I'll estimate units and profit based on your inputs and assumptions. Ask questions or request a scenario.");
    }
  }, [step]);

  useEffect(() => {
    if (step !== 'logo') {
      return;
    }
    // Only skip if already loading or if we already have an intro message
    if (logoIntroLoading || logoIntroMessage) {
      return;
    }

    setLogoIntroError(null);
    setLogoIntroMessage("");

    let cancelled = false;
    let latestIntroText = "";

    const runIntro = async () => {
      setLogoIntroLoading(true);
      try {
        const normalizedPalette = normalizePaletteHexes(paletteColors);
        const payload = createLogoGeneratorIntroPayload({
          brandName,
          industry,
          vibe,
          paletteHexes: normalizedPalette,
        });

        const streamResult = await streamAgencyRespond(payload, (chunk) => {
          if (cancelled) return;
          if (chunk.type === 'delta') {
            latestIntroText = latestIntroText ? `${latestIntroText}${chunk.message}` : chunk.message;
            setLogoIntroMessage(latestIntroText);
          } else if (chunk.type === 'message') {
            // Replace with full message when received
            latestIntroText = chunk.message || latestIntroText;
            setLogoIntroMessage(latestIntroText);
          }
        });

        if (!latestIntroText) {
          const streamText = extractMessageFromSSE(streamResult?.text || '');
          if (streamText) {
            latestIntroText = streamText;
          }
        }

        if (!latestIntroText) {
          const jr = await postAgencyRespond(payload);
          const j = jr?.data ?? jr;
          const fallback = extractMessageFromSSE(j?.message || j?.data?.message || '');
          if (fallback) {
            latestIntroText = fallback;
          }
        }

        if (cancelled) return;

        if (latestIntroText) {
          setLogoIntroMessage(latestIntroText);
          setLogoChatHistory([{ role: 'assistant', text: latestIntroText }]);
        } else {
          setLogoIntroMessage(logoIntroFallback);
          setLogoChatHistory([{ role: 'assistant', text: logoIntroFallback }]);
        }
      } catch (e) {
        if (!cancelled) {
          setLogoIntroError("I couldn't reach LogoGenerator right now. Share your style preferences to get started.");
          setLogoIntroMessage("");
        }
      } finally {
        if (!cancelled) {
          setLogoIntroLoading(false);
        }
      }
    };

    runIntro();

    return () => {
      cancelled = true;
    };
  }, [step, brandName, industry, vibe, paletteColors, logoIntroLoading, logoIntroMessage, logoIntroFallback]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTipIndex((prevIndex) => (prevIndex + 1) % tips.length);
    }, 9000);
    return () => clearInterval(interval);
  }, [tips.length]);

  // Ensure booking embed script is present when entering the booking step
  useEffect(() => {
    if (step === 'book') {
      const existing = document.querySelector('script[src*="msgsndr.com/js/form_embed.js"]') as HTMLScriptElement | null;
      if (!existing) {
        const s = document.createElement('script');
        s.src = 'https://msgsndr.com/js/form_embed.js';
        s.defer = true;
        s.setAttribute('data-service', BOOKING_SERVICE_ID);
        document.body.appendChild(s);
      } else {
        // Update service id to ensure correct widget initializes
        existing.setAttribute('data-service', BOOKING_SERVICE_ID);
      }
    }
  }, [step]);

  // Persist wizard progress in localStorage so regeneration doesn't lose state
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bmnWizardState');
      if (saved) {
        const s = JSON.parse(saved);
        setStep(s.step ?? "form");
        setUser(s.user ?? { name:"", email:"", ig:"" });
        setVibe(s.vibe ?? "");
        setIndustry(s.industry ?? "");
        setBrandName(s.brandName ?? "");
        setPaletteColors(s.paletteColors ?? []);
        setPaletteSelected(!!(s.paletteColors && s.paletteColors.length));
        setLogoStyles(s.logoStyles ?? []);
        setIconStyle(s.iconStyle ?? "");
        setTypography(s.typography ?? "");
        setLogoOptions(s.logoOptions ?? []);
        setChosenLogo(s.chosenLogo ?? null);
      }
    } catch(e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    const toSave = { step, user, vibe, industry, brandName, paletteColors, logoStyles, iconStyle, typography, logoOptions, chosenLogo };
    try {
      localStorage.setItem('bmnWizardState', JSON.stringify(toSave));
    } catch(e) {
      // ignore
    }
  }, [step, user, vibe, industry, brandName, paletteColors, logoStyles, iconStyle, typography, logoOptions, chosenLogo]);

  useEffect(() => {
    if (step !== "social") return;

    setSocialIntroLoading(false);
    setSocialIntroError(null);
    setSocialIntroMessage("");

    let cancelled = false;
    let latestIntroText = "";

    const runIntro = async () => {
      setSocialIntroLoading(true);
      try {
        const payload = createBrandVisionPayload({
          message: "system: onboard step",
          chatHistory: [],
          brandName,
          industry,
          vibe,
          instagram: user.ig,
        });

        const streamResult = await streamAgencyRespond(payload, (chunk) => {
          if (cancelled) return;
          if (chunk.type === 'delta') {
            // Accumulate delta chunks
            if (chunk.message) {
              latestIntroText += chunk.message;
            }
            setSocialIntroMessage(latestIntroText);
          } else if (chunk.type === 'message') {
            // Replace with full message when received
            latestIntroText = chunk.message || latestIntroText;
            setSocialIntroMessage(latestIntroText);
          }
        });

        if (!latestIntroText) {
          const streamText = extractMessageFromSSE(streamResult?.text || '');
          if (streamText) {
            latestIntroText = streamText;
          }
        }

        if (!latestIntroText) {
          const jr = await postAgencyRespond(payload);
          const j = jr?.data ?? jr;
          const fallback = extractMessageFromSSE(j?.message || j?.data?.message || '');
          if (fallback) {
            latestIntroText = fallback;
          }
        }

        if (!latestIntroText) {
          // Default message when BrandVision doesn't load
          const greetingName = brandName?.trim() || 'a';
          latestIntroText = `Hi, ${greetingName}. Now let's define your brand vision to create something amazing.\n\nThis helps me generate personalized palettes, logos, and suggestions.\n\nTell me about your brand style, mood, and audience.`;
        }

        if (!cancelled && latestIntroText) {
          setSocialIntroMessage(latestIntroText);
        }
      } catch (e) {
        if (!cancelled) {
          setSocialIntroError("I couldn't reach BrandVision right now. Tell me about your brand vision to get started.");
          setSocialIntroMessage("");
        }
      } finally {
        if (!cancelled) {
          setSocialIntroLoading(false);
        }
      }
    };

    runIntro();

    return () => {
      cancelled = true;
    };
  }, [step, brandName, industry, vibe, user.ig]);

  useEffect(() => {
    if (step !== "name") return;

    setNameIntroLoading(false);
    setNameIntroError(null);
    setNameIntroMessage("");

    let cancelled = false;
    let latestIntroText = "";

    const runIntro = async () => {
      setNameIntroLoading(true);
      try {
        const payload = createNameIntroPayload({
          brandName,
          industry,
          vibe,
          instagram: user.ig,
        });

        const streamResult = await streamAgencyRespond(payload, (chunk) => {
          if (cancelled) return;
          if (chunk.type === 'delta') {
            // Accumulate delta chunks
            if (chunk.message) {
              latestIntroText += chunk.message;
            }
            setNameIntroMessage(latestIntroText);
          } else if (chunk.type === 'message') {
            // Replace with full message when received
            latestIntroText = chunk.message || latestIntroText;
            setNameIntroMessage(latestIntroText);
          }
        });

        if (!latestIntroText) {
          const streamText = extractMessageFromSSE(streamResult?.text || '');
          if (streamText) {
            latestIntroText = streamText;
          }
        }

        if (!latestIntroText) {
          const jr = await postAgencyRespond(payload);
          const j = jr?.data ?? jr;
          const fallback = extractMessageFromSSE(j?.message || j?.data?.message || '');
          if (fallback) {
            latestIntroText = fallback;
          }
        }

        if (!latestIntroText) {
          // Default message when NameSelector doesn't load
          const greetingName = brandName?.trim() || 'a';
          latestIntroText = `Hi, ${greetingName}. Let's find the perfect brand name for you.\n\nI'll brainstorm names that match your vibe and automatically check domain availability.\n\nShare your naming preferences, style, or any keywords you want included.`;
        }

        if (!cancelled && latestIntroText) {
          setNameIntroMessage(latestIntroText);
        }
      } catch (e) {
        if (!cancelled) {
          setNameIntroError("I couldn't reach NameSelector right now. Tell me about your naming preferences to get started.");
          setNameIntroMessage("");
        }
      } finally {
        if (!cancelled) {
          setNameIntroLoading(false);
        }
      }
    };

    runIntro();

    return () => {
      cancelled = true;
    };
  }, [step, brandName, industry, vibe, user.ig]);

  useEffect(() => {
    if (step !== "palette") return;
    setPaletteIntroMessage("");
    setPaletteIntroError(null);
    setPaletteIntroLoading(false);
    let cancelled = false;

    const extractMessageFromJson = (text: string): string => {
      if (!text || typeof text !== 'string') return text || '';
      
      // Try to parse as JSON and extract message field
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && parsed.message) {
          return String(parsed.message);
        }
      } catch (_) {
        // Not valid JSON (might be partial during streaming), try to extract message field
        // Look for "message": "..." pattern, handling escaped quotes
        const messageKeyIndex = text.indexOf('"message"');
        if (messageKeyIndex !== -1) {
          const afterKey = text.substring(messageKeyIndex + 9); // length of "message"
          const colonIndex = afterKey.indexOf(':');
          if (colonIndex !== -1) {
            const afterColon = afterKey.substring(colonIndex + 1).trim();
            // Check if it's a string value (starts with ")
            if (afterColon.startsWith('"')) {
              // Find the closing quote, handling escaped quotes
              let endIndex = 1;
              let escaped = false;
              while (endIndex < afterColon.length) {
                const char = afterColon[endIndex];
                if (escaped) {
                  escaped = false;
                  endIndex++;
                  continue;
                }
                if (char === '\\') {
                  escaped = true;
                  endIndex++;
                  continue;
                }
                if (char === '"') {
                  // Found the closing quote
                  const messageValue = afterColon.substring(1, endIndex);
                  // Unescape common escape sequences
                  return messageValue
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, '\n')
                    .replace(/\\t/g, '\t')
                    .replace(/\\\\/g, '\\');
                }
                endIndex++;
              }
            }
          }
        }
      }
      
      return text;
    };

    const runPaletteIntro = async () => {
      setPaletteIntroLoading(true);
      setPaletteIntroMessage("");
      setPaletteIntroError(null);

      const payload = createPaletteIntroPayload({ brandName, industry, vibe });

      let accumulatedText = "";

      try {
        const { text } = await streamAgencyRespond(payload, ({ type, message }) => {
          if (type === 'delta') {
            accumulatedText = accumulatedText ? `${accumulatedText}${message}` : message;
            const extracted = extractMessageFromJson(accumulatedText);
            setPaletteIntroMessage(extracted);
          } else if (type === 'message') {
            accumulatedText = message || accumulatedText;
            const extracted = extractMessageFromJson(accumulatedText);
            setPaletteIntroMessage(extracted);
          }
        });

        if (!cancelled) {
          const finalText = text?.trim() ? text : paletteIntroFallback;
          const extracted = extractMessageFromJson(finalText);
          setPaletteIntroMessage(extracted || paletteIntroFallback);
        }
      } catch (e: any) {
        if (!cancelled) {
          setPaletteIntroError(e?.message || 'Failed to load intro message.');
          setPaletteIntroMessage(paletteIntroFallback);
        }
      } finally {
        if (!cancelled) {
          setPaletteIntroLoading(false);
        }
      }
    };

    runPaletteIntro();

    return () => {
      cancelled = true;
    };
  }, [step, brandName, industry, vibe, paletteIntroFallback]);

  useEffect(() => {
    if (step !== "social") return;
    setSocialStreamingText("");
    setSocialFinalMessage("");
    setSocialScanSucceeded(false);
    setSocialAgentMessage("");
  }, [step]);

  useEffect(() => {
    if (step !== "name") return;
    setNameAgentMessage("");
    setNameScanSucceeded(false);
    setNameChatHistory([]);
    setNameSuggestions([]);
    setNameStreamingText("");
    setNameFinalMessage("");
  }, [step]);

  useEffect(() => {
    if (step !== "palette") return;
    setPaletteAgentMessage("");
    setPaletteScanSucceeded(false);
    setPaletteChatHistory([]);
    setPaletteStreamingText("");
    setPaletteFinalMessage("");
  }, [step]);

  const Palettes: string[][] = [
    ["#0ea5e9", "#0369a1", "#111827"],
    ["#22c55e", "#14532d", "#0f172a"],
    ["#f59e0b", "#b45309", "#111827"],
    ["#ef4444", "#7f1d1d", "#0f172a"],
    ["#8b5cf6", "#6d28d9", "#1e1b4b"],
    ["#06b6d4", "#0891b2", "#0c4a6e"],
    ["#84cc16", "#65a30d", "#1f2937"],
    ["#f97316", "#c2410c", "#1f2937"],
  ];


  const styleSeeds = ["Futuristic", "Elegant", "Minimalist", "Geometric", "Mascot", "Nature"];
  const Categories = [
    { id: "supplements", label: "Supplements" },
    { id: "fashion", label: "Fashion" },
    { id: "beauty", label: "Beauty" },
    { id: "hydration", label: "Hydration" },
  ];
  const SKUs = [
    { sku: "PROT-01", title: "Whey Protein 2lb", blurb: "Vanilla. Clean label.", category: "supplements" },
    { sku: "HYD-02", title: "Hydration Sticks", blurb: "Electrolytes, 30ct.", category: "hydration" },
    { sku: "GRN-03", title: "Daily Greens", blurb: "Superfood blend.", category: "supplements" },
    { sku: "FACE-01", title: "Glow Serum", blurb: "Vitamin C + peptides.", category: "beauty" },
  ];

  const MockAPI = {
    async availability(name: string) {
      await sleep(400);
      const ok = name.trim().length % 2 === 0 && name.trim().length > 0;
      return { available: ok, suggestion: ok ? undefined : `${name}co` };
    },
    async logos(_: { brand_name: string; styles: string[]; palette: string[] }) {
      await sleep(900);
      return { options: [
        "https://picsum.photos/seed/logoA/320/160",
        "https://picsum.photos/seed/logoB/320/160",
        "https://picsum.photos/seed/logoC/320/160",
      ]};
    },
    async preview(_: { sku: string; logo: string }) {
      await sleep(800);
      return { images: [
        "https://picsum.photos/seed/mock1/640/480",
        "https://picsum.photos/seed/mock2/640/480",
      ]};
    },
    async estimate({ base, retail, followers, conv }: any) {
      await sleep(300);
      const unit = retail - base;
      const units = Math.round(followers * conv);
      return { estUnits: units, estProfit: units * unit };
    }
  };

  // Generate N logo options using Fal.ai backend, using current wizard inputs
  const generateLogoOptions = async (count: number) => {
    setLogoError("");
    setLogoLoading(true);
    const t0 = performance.now();
    // Pre-generation validation: ensure palette has valid HEX colors
    const normalizedPalette = normalizePaletteHexes(paletteColors);
    if (!normalizedPalette.length) {
      setLogoError("Please select a valid color palette before generating logos.");
      setLogoLoading(false);
      return;
    }
    if (!brandName?.trim()) {
      // Non-blocking warning; generation can proceed without a brand name
      setLogoError("Brand name is missing. The generated logo may not include your brand text.");
    }
    const primaryHex = dominantPaletteColor(normalizedPalette);
    const secondaryHexes = (normalizedPalette || []).map(c => (colorMap[String(c).toLowerCase()] || c)).filter(h => h !== primaryHex);
    try {
      let attempt = 0;
      let finalUrls: string[] = [];
      let finalPassing: string[] = [];
      let finalFailing: string[] = [];
      while (attempt < 2 && finalPassing.length === 0) {
        const reinforce = attempt === 0 ? "" : " STRICT MODE: Use PRIMARY color for ~80-90% of shapes and text; secondary accents ≤10-20%. Absolutely NO hues outside the listed palette. If unsure, use monochrome PRIMARY.";
        const basePrompt = buildLogoPrompt({ brandName, industry, vibe, paletteColors: normalizedPalette, logoStyles, iconStyle, typography });
        // Enforce specified Fal model per requirements
        const defaultFalModel = 'fal-ai/flux-pro/v1/fill';
        const guidance = 4.0; // balanced adherence
        const steps = 18; // fewer steps for speed
        const baseSeed = Math.floor(Date.now() % 1000000);
        const cacheKey = JSON.stringify({ k:'fal', count, basePrompt, normalizedPalette, primaryHex, secondaryHexes, model: defaultFalModel, guidance, steps, size:'768x768', attempt });
        const cached = logoCacheRef.current.get(cacheKey);
        const requests = cached ? [] : Array.from({ length: count }, (_, i) => {
          const variant = i === 0 ? "" : ` variation ${i+1}`;
          const prompt = `${basePrompt}.${variant}. Use ONLY these HEX colors: ${(normalizedPalette).join(', ')}. Ensure PRIMARY color is ${primaryHex || (normalizedPalette?.[0]||'selected palette primary')} used predominantly. Secondary accents: ${(secondaryHexes && secondaryHexes.length ? secondaryHexes.join(', ') : 'none')}. Avoid any hues not in the listed palette.${reinforce}`;
          return fetchFalImage(prompt + '. flat background, clean vector logo, no photo, no 3D, no mockup, simple shapes, high contrast.', "768x768", { model: defaultFalModel, guidance_scale: guidance, num_inference_steps: steps, seed: baseSeed + i });
        });
        const urls = cached ? cached : await Promise.all(requests);
        finalUrls = urls; // keep last attempt URLs for fallback display
        if (!cached) logoCacheRef.current.set(cacheKey, urls);

        const validations = await Promise.all(finalUrls.map(async (u) => {
          try {
            const cachedV = validationCacheRef.current.get(u);
            if (cachedV) return { url: u, pass: cachedV.pass, score: cachedV.score };
            const analysis = await analyzeImageFromUrl(u, { sampleStep: 8, primaryHex: primaryHex || (paletteColors?.[0] || undefined), paletteHexes: normalizedPalette, whiteLuma: 0.93, alphaMin: 15 });
            const cmp = comparePaletteWithImage(normalizedPalette, analysis);
            const res = { pass: cmp.passed, score: cmp.primaryMatchScore };
            validationCacheRef.current.set(u, res);
            return { url: u, pass: res.pass, score: res.score };
          } catch (e:any) {
            return { url: u, pass: false, score: 0 };
          }
        }));

        finalPassing = validations.filter(v => v.pass).sort((a,b)=>b.score-a.score).map(v=>v.url);
        finalFailing = validations.filter(v => !v.pass).map(v=>v.url);
        attempt++;
      }

      if (finalPassing.length) {
        setLogoOptions(finalPassing.concat(finalFailing)); // show passing logos first
        if (!chosenLogo) setChosenLogo(finalPassing[0]);
      } else {
        // No logos passed validation; surface error but still show options
        setLogoOptions(finalUrls);
        setLogoError("Generated logos may not match the selected color palette. We applied strict color guidance; please try again.");
      }
      if (!chosenLogo && finalUrls.length) setChosenLogo(finalUrls[0]);
    } catch (e:any) {
      setLogoError(e?.message || 'Generation failed. Please try again or adjust inputs.');
    } finally {
      setLogoLoading(false);
      const t1 = performance.now();
      console.debug(`[Logo Generation] Completed in ${(t1 - t0).toFixed(0)}ms`);
    }
  };

  // Generate logo options using General Agency (agent) response: expects JSON with message + 3 logo URLs
  const generateLogoOptionsViaAgent = async (count: number) => {
    setLogoError("");
    setLogoLoading(true);
    const t0 = performance.now();
    // Validate palette hexes first
    const normalizedPalette = normalizePaletteHexes(paletteColors);
    if (!normalizedPalette.length) {
      setLogoError("Please select a valid color palette before generating logos.");
      setLogoLoading(false);
      return;
    }
    if (!brandName?.trim()) {
      setLogoError("Brand name is missing. The agent may not include brand text in generated concepts.");
    }

    try {
      const primaryHex = dominantPaletteColor(normalizedPalette);
      const secondaryHexes = normalizedPalette.filter(h => h !== primaryHex);

      const inputText = composeLogoGeneratorMessage({
        prompt: logoUserPrompt,
        brandName,
        industry,
        vibe,
        paletteHexes: normalizedPalette,
        styles: logoStyles,
        typography,
      });

      // Cache before hitting the agent
      const agentCacheKey = JSON.stringify({ k:'agent', count, inputText });
      const cachedAgent = logoCacheRef.current.get(agentCacheKey);
      // Use agent cache only for the first generation; allow Regenerate to produce fresh outputs
      if (!logoOptions.length && cachedAgent && cachedAgent.length) {
        setLogoOptions(cachedAgent);
        if (!chosenLogo) setChosenLogo(cachedAgent[0]);
        setLogoLoading(false);
        return;
      }

      // Send chat history including current user message
      const chat_history: AgencyMessage[] = [
        ...logoChatHistory.map(m => ({ role: m.role, content: m.text } as AgencyMessage)),
        { role: 'user', content: inputText }
      ];

      const payload = createLogoGeneratorPayload({
        message: inputText,
        chatHistory: chat_history,
        brandName,
        industry,
        vibe,
        paletteHexes: normalizedPalette,
      });

      // Start streaming for typing effect
      setLogoAgentMessage("");
      setLogoChatHistory(prev => [...prev, { role: 'user', text: inputText }]);
      let streamedText = "";
      await streamAgencyRespond(payload, ({ type, message }) => {
        if (type === 'delta') {
          streamedText = streamedText ? `${streamedText}${message}` : message;
          // Remove first tool call from streamed text in real-time
          const displayText = removeFirstToolCall(streamedText);
          setLogoAgentMessage(displayText);
        } else if (type === 'message') {
          streamedText = message || streamedText;
          // Remove first tool call from message
          const displayText = removeFirstToolCall(streamedText);
          setLogoAgentMessage(displayText);
        }
      });

      // Fetch final structured output
      const jr = await postAgencyRespond(payload);
      const j = jr?.data ?? jr; // proxy may wrap
      let streamingText = streamedText || logoAgentMessage || '';
      let agentText = extractMessageFromSSE(j?.message || j?.data?.message || streamingText || '');
      
      // Remove first tool call JSON object (from {"brand_name" to })
      agentText = removeFirstToolCall(agentText);
      
      let parsedInner: any = null;
      if (agentText && typeof agentText === 'string') {
        try { parsedInner = JSON.parse(agentText); } catch(_) { parsedInner = null; }
      } else if (typeof agentText === 'object' && agentText) {
        parsedInner = agentText;
      }
      
      // Extract message text (hide tool calls)
      let displayMessage = '';
      if (parsedInner && parsedInner.message) {
        displayMessage = parsedInner.message;
        agentText = displayMessage;
      } else if (agentText && typeof agentText === 'string' && !parsedInner) {
        // If it's not JSON, use the text as-is (after removing tool call)
        displayMessage = agentText;
      }
      
      // Extract logo URLs from structured output
      let urls: string[] = [];
      if (parsedInner) {
        urls = parsedInner.logo_urls || parsedInner.logos || parsedInner.images || [];
      }
      if (!Array.isArray(urls) || !urls.length) {
        // Try direct fields from j if inner parsing failed
        urls = j?.logo_urls || j?.logos || j?.images || j?.data?.logo_urls || [];
      }

      // Normalize URL list: extract URLs from objects like { style, url }
      // Extract just the URL part from "https" until ".png" (or end of URL)
      if (Array.isArray(urls)) {
        urls = urls
          .map((u: any) => {
            let urlStr = '';
            if (typeof u === 'string') {
              urlStr = u;
            } else if (u && typeof u === 'object') {
              urlStr = u.url || u.image_url || u.src || '';
            }
            
            if (urlStr && typeof urlStr === 'string') {
              urlStr = urlStr.trim();
              // Extract from "https" until ".png" if present
              const httpsIndex = urlStr.indexOf('https://');
              if (httpsIndex !== -1) {
                const pngIndex = urlStr.indexOf('.png', httpsIndex);
                if (pngIndex !== -1) {
                  return urlStr.substring(httpsIndex, pngIndex + 4);
                }
                // If no .png, take until end or next whitespace/quote
                const endMatch = urlStr.substring(httpsIndex).match(/^https:\/\/[^\s"']+/);
                if (endMatch) {
                  return endMatch[0];
                }
              }
              return urlStr;
            }
            return '';
          })
          .filter((s: string) => typeof s === 'string' && s.trim().length > 0);
      }

      // Only use agency endpoint - no FalAI fallback
      if (!Array.isArray(urls) || !urls.length) {
        setLogoError("The agent didn't return any logo URLs. Please try again or adjust your inputs.");
        setLogoAgentMessage(agentText || streamingText || "");
        setLogoChatHistory(prev => [...prev, { role: 'assistant', text: agentText || streamingText || '' }]);
        setLogoLoading(false);
        return;
      }

      // Update message + history + options (use displayMessage which excludes tool calls)
      setLogoAgentMessage(displayMessage || agentText || "");
      setLogoChatHistory(prev => [...prev, { role: 'assistant', text: displayMessage || agentText || 'Generated 3 logo options.' }]);
      // Clear any previous errors since we have logos
      setLogoError("");

      // Keep palette-compliance ordering as before
      const validations = await Promise.all(urls.map(async (u) => {
        try {
          const cachedV = validationCacheRef.current.get(u);
          if (cachedV) return { url: u, pass: cachedV.pass, score: cachedV.score };
          const analysis = await analyzeImageFromUrl(u, { sampleStep: 8, primaryHex: primaryHex || (paletteColors?.[0] || undefined), paletteHexes: normalizedPalette, whiteLuma: 0.93, alphaMin: 15 });
          const cmp = comparePaletteWithImage(normalizedPalette, analysis);
          const res = { pass: cmp.passed, score: cmp.primaryMatchScore };
          validationCacheRef.current.set(u, res);
          return { url: u, pass: res.pass, score: res.score };
        } catch {
          return { url: u, pass: false, score: 0 };
        }
      }));
      const passing = validations.filter(v => v.pass).sort((a,b)=>b.score-a.score).map(v=>v.url);
      const failing = validations.filter(v => !v.pass).map(v=>v.url);

      const ordered = passing.length ? passing.concat(failing) : urls;
      // Save agent result to cache for initial loads
      logoCacheRef.current.set(agentCacheKey, ordered);
      setLogoOptions(ordered);
      if (!chosenLogo && ordered.length) setChosenLogo(ordered[0]);
    } catch (e:any) {
      setLogoError(e?.message || 'Generation failed. Please try again or adjust inputs.');
    } finally {
      setLogoLoading(false);
      const t1 = performance.now();
      console.debug(`[Agent Logo Generation] Completed in ${(t1 - t0).toFixed(0)}ms`);
    }
  };

  // Generate/refine palette using General Agency streaming + final structured response
  const refinePaletteViaAgent = async (overridePrompt?: string) => {
    setPaletteAgentMessage("");
    setPaletteStreamingText("");
    setPaletteFinalMessage("");
    setPaletteScanSucceeded(false);
    setPaletteLoading(true);
    try {
      const normalizedPalette = (paletteColors || [])
        .map(c => (colorMap[String(c).toLowerCase()] || c))
        .map(c => (c.startsWith('#') ? c : `#${c}`))
        .filter(c => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c));

      const parts: string[] = [];
      const trimmedOverride = overridePrompt?.trim() ?? '';
      const trimmedPrimary = paletteUserPrompt?.trim() ?? '';
      const activePrompt = trimmedOverride || trimmedPrimary;
      
      if (activePrompt) parts.push(activePrompt);
      if (normalizedPalette.length) parts.push(`current palette: ${normalizedPalette.join(', ')}`);
      if (brandName?.trim()) parts.push(`brand: ${brandName}`);
      if (vibe?.trim()) parts.push(`vibe: ${vibe}`);
      if (industry?.trim()) parts.push(`industry: ${industry}`);
      const inputText = parts.join('. ');
      const userDisplay = trimmedOverride || inputText;

      const chat_history: AgencyMessage[] = [
        ...paletteChatHistory.map(m => ({ role: m.role, content: m.text } as AgencyMessage)),
        { role: 'user', content: inputText }
      ];

      const payload = {
        recipient_agent: "ColorPaletteSelector",
        input: inputText,
        context: { brandName, industry, vibe },
        params: { output: "color_palette", format: "json" },
        structured_output: true,
        chat_history,
      };

      // Stream typing first
      setPaletteChatHistory(prev => [...prev, { role: 'user', text: userDisplay }]);
      let streamingText = "";
      await streamAgencyRespond(payload, ({ type, message }) => {
        if (type === 'delta') {
          streamingText = streamingText ? `${streamingText}${message}` : message;
          setPaletteStreamingText(streamingText);
          setPaletteAgentMessage(streamingText);
          setPaletteScanSucceeded(true);
        } else if (type === 'message') {
          streamingText = message || streamingText;
          setPaletteStreamingText(streamingText);
          setPaletteAgentMessage(streamingText);
          setPaletteScanSucceeded(true);
        }
      });

      // Fetch final structured output
      const jr = await postAgencyRespond(payload);
      const j = jr?.data ?? jr;
      let agentText = extractMessageFromSSE(j?.message || j?.data?.message || streamingText || '');
      let parsedInner: any = null;
      if (agentText && typeof agentText === 'string') {
        try { parsedInner = JSON.parse(agentText); } catch(_) { parsedInner = null; }
      } else if (typeof agentText === 'object' && agentText) {
        parsedInner = agentText;
      }
      if (parsedInner && parsedInner.message) {
        agentText = parsedInner.message;
      }
      // Extract color palette
      let newPalette: string[] = [];
      if (parsedInner) {
        newPalette = parsedInner.color_palette || parsedInner.palette || [];
      }
      if (!Array.isArray(newPalette) || !newPalette.length) {
        newPalette = j?.color_palette || j?.data?.color_palette || [];
      }
      if (Array.isArray(newPalette) && newPalette.length) {
        const normalized = newPalette
          .map((c:any) => String(c))
          .map((c:string) => (colorMap[String(c).toLowerCase()] || c))
          .map((c:string) => (c.startsWith('#') ? c : `#${c}`))
          .filter((c:string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c));
        if (normalized.length) {
          setPaletteColors(normalized);
          setPaletteSelected(true);
          setPaletteScanSucceeded(true);
        }
      }
      const finalMessage = agentText || streamingText || "";
      setPaletteFinalMessage(finalMessage);
      setPaletteAgentMessage(finalMessage);
      setPaletteChatHistory(prev => [...prev, { role: 'assistant', text: finalMessage || 'Updated your color palette.' }]);
    } catch (e:any) {
      const errorMsg = e?.message || 'Failed to refine palette. Please try again.';
      setPaletteAgentMessage(errorMsg);
      setPaletteFinalMessage(errorMsg);
    } finally {
      setPaletteLoading(false);
    }
  };

  const handlePaletteAnalyze = () => {
    if (paletteLoading) return;
    void refinePaletteViaAgent();
  };

  const handlePaletteRefine = () => {
    if (paletteLoading) return;
    if (!paletteRefinePrompt.trim()) return;
    void refinePaletteViaAgent(paletteRefinePrompt);
    setPaletteRefinePrompt('');
  };

  const handlePaletteContinue = () => {
    if (paletteLoading) return;
    if (!paletteScanSucceeded) return;
    setStep("loading4");
  };

  // Suggest brand names via General Agency (stream + final JSON) - similar to analyzeSocialViaAgent
  const suggestNamesViaAgent = async (overridePrompt?: string): Promise<string> => {
    setNameAgentMessage("");
    setNameSuggestions([]);
    setNameLoading(true);
    setNameStreamingText("");
    setNameFinalMessage("");
    setNameScanSucceeded(false);
    try {
      const parts: string[] = [];
      const trimmedOverride = overridePrompt?.trim() ?? '';
      const trimmedPrimary = nameUserPrompt?.trim() ?? '';
      const activePrompt = trimmedOverride || trimmedPrimary;

      if (activePrompt) parts.push(activePrompt);
      if (vibe?.trim()) parts.push(`vibe: ${vibe}`);
      if (industry?.trim()) parts.push(`industry: ${industry}`);
      if (user?.ig?.trim()) parts.push(`audience: ${user.ig}`);
      const inputText = parts.join('. ');
      const userDisplay = trimmedOverride || inputText;

      const nextHistory: AgencyMessage[] = [
        ...nameChatHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.text } as AgencyMessage)),
        { role: 'user', content: inputText }
      ];

      setNameChatHistory(prev => [...prev, { role: 'user', text: userDisplay }]);

      const streamPayload = createNamePayload({
        message: inputText,
        chatHistory: nextHistory,
        brandName,
        industry,
        vibe,
        instagram: user.ig,
      });

      const { message: finalMessage, helpers } = await requestAgencyResponse({
        payload: streamPayload,
        onStream: (txt) => {
          setNameStreamingText(txt);
          setNameAgentMessage(txt);
          setNameScanSucceeded(true);
        },
      });

      if (finalMessage) {
        setNameFinalMessage(finalMessage);
        setNameAgentMessage(finalMessage);
        setNameScanSucceeded(true);
        setNameChatHistory(prev => [...prev, { role: 'assistant', text: finalMessage }]);
      }

      // Extract name suggestions from helpers or parsed response
      if (Array.isArray(helpers) && helpers.length) {
        const unique = Array.from(new Set(helpers.map(n => String(n).trim()).filter(Boolean)));
        setNameSuggestions(unique);
      } else {
        // Try to extract from final message if it's JSON
        try {
          const parsed = JSON.parse(finalMessage);
          const names = parsed.name_suggestions || parsed.names || [];
          if (Array.isArray(names) && names.length) {
            const unique = Array.from(new Set(names.map(n => String(n).trim()).filter(Boolean)));
            setNameSuggestions(unique);
          }
        } catch (_) {
          // Not JSON, ignore
        }
      }

      return finalMessage;
    } catch (e:any) {
      const msg = e?.message || 'Failed to analyze names. Please try again.';
      setNameAgentMessage(msg);
      return "";
    } finally {
      setNameLoading(false);
    }
  };

  const handleNameAnalyze = () => {
    if (nameLoading) return;
    void suggestNamesViaAgent();
  };

  const handleNameRefine = () => {
    if (nameLoading) return;
    if (!nameRefinePrompt.trim()) return;
    void suggestNamesViaAgent(nameRefinePrompt);
    setNameRefinePrompt('');
  };

  const handleNameContinue = () => {
    if (nameLoading) return;
    if (!nameScanSucceeded) return;
    setStep("loading3");
  };

  // Analyze brand vision & audience (BrandVision): stream + final JSON
  const analyzeSocialViaAgent = async (overridePrompt?: string): Promise<string> => {
    setSocialAgentMessage("");
    setSocialHelpers([]);
    setSocialLoading(true);
    setSocialStreamingText("");
    setSocialFinalMessage("");
    setSocialScanSucceeded(false);
    try {
      const parts: string[] = [];
      const trimmedOverride = overridePrompt?.trim() ?? '';
      const trimmedPrimary = socialUserPrompt?.trim() ?? '';
      const activePrompt = trimmedOverride || trimmedPrimary;

      if (activePrompt) parts.push(activePrompt);
      if (vibe?.trim()) parts.push(`vibe: ${vibe}`);
      if (industry?.trim()) parts.push(`industry: ${industry}`);
      if (user?.ig?.trim()) parts.push(`audience: ${user.ig}`);
      const inputText = parts.join('. ');
      const userDisplay = trimmedOverride || inputText;

      const nextHistory: AgencyMessage[] = [
        ...socialChatHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.text } as AgencyMessage)),
        { role: 'user', content: inputText }
      ];

      setSocialChatHistory(prev => [...prev, { role: 'user', text: userDisplay }]);

      const streamPayload = createBrandVisionPayload({
        message: inputText,
        chatHistory: nextHistory,
        brandName,
        industry,
        vibe,
        instagram: user.ig,
      });

      const { message: finalMessage, helpers } = await requestAgencyResponse({
        payload: streamPayload,
        onStream: (txt) => {
          setSocialStreamingText(txt);
          setSocialAgentMessage(txt);
          setSocialScanSucceeded(true);
        },
      });

      if (finalMessage) {
        setSocialFinalMessage(finalMessage);
        setSocialAgentMessage(finalMessage);
        setSocialScanSucceeded(true);
        setSocialChatHistory(prev => [...prev, { role: 'assistant', text: finalMessage }]);
      }

      setSocialHelpers(helpers);

      return finalMessage;
    } catch (e:any) {
      const msg = e?.message || 'Failed to analyze vision. Please try again.';
      setSocialAgentMessage(msg);
      return "";
    } finally {
      setSocialLoading(false);
    }
  };

  // Suggest products (ProductAdvisor): stream + final JSON
  const suggestProductsViaAgent = async () => {
    setProductAgentMessage("");
    setProductLoading(true);
    try {
      const parts: string[] = [];
      if (productUserPrompt?.trim()) parts.push(productUserPrompt.trim());
      if (category?.trim()) parts.push(`category: ${category}`);
      if (brandName?.trim()) parts.push(`brand: ${brandName}`);
      if (vibe?.trim()) parts.push(`vibe: ${vibe}`);
      if (industry?.trim()) parts.push(`industry: ${industry}`);
      const inputText = parts.join('. ');

      const chat_history: AgencyMessage[] = [
        ...productChatHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.text } as AgencyMessage)),
        { role: 'user', content: inputText }
      ];

      const payload = {
        recipient_agent: "ProductAdvisor",
        message: inputText,
        chat_history,
        file_ids: null,
        file_urls: null,
        additional_instructions: null,
      };

      setProductChatHistory(prev => [...prev, { role: 'user', text: inputText }]);
      await streamAgencyRespond(payload, ({ type, message }) => {
        if (type === 'delta') {
          setProductAgentMessage(prev => prev ? `${prev}${message}` : message);
        } else if (type === 'message') {
          setProductAgentMessage(message || '');
        }
      });

      const jr = await postAgencyRespond(payload);
      const j = jr?.data ?? jr;
      let agentText = extractMessageFromSSE(j?.message || j?.data?.message || '');
      let parsedInner: any = null;
      if (agentText && typeof agentText === 'string') {
        try { parsedInner = JSON.parse(agentText); } catch(_) { parsedInner = null; }
      } else if (typeof agentText === 'object' && agentText) {
        parsedInner = agentText;
      }
      if (parsedInner && parsedInner.message) {
        agentText = parsedInner.message;
      }
      let suggestions: Array<{ sku: string; title: string; blurb: string; category: string }> = [];
      if (parsedInner) {
        suggestions = parsedInner.product_suggestions || parsedInner.suggestions || [];
      }
      if (!Array.isArray(suggestions) || !suggestions.length) {
        suggestions = j?.product_suggestions || j?.data?.product_suggestions || [];
      }
      if (Array.isArray(suggestions) && suggestions.length) {
        setProductSuggestions(suggestions.map((s:any) => ({
          sku: String(s?.sku || ''),
          title: String(s?.title || s?.name || 'Suggested Product'),
          blurb: String(s?.blurb || s?.description || ''),
          category: String(s?.category || category || ''),
        })));
      }
      setProductAgentMessage(agentText || "");
      setProductChatHistory(prev => [...prev, { role: 'assistant', text: agentText || 'Here are product ideas that fit your brand.' }]);
    } catch (e:any) {
      setProductAgentMessage(e?.message || 'Failed to suggest products. Please try again.');
    } finally {
      setProductLoading(false);
    }
  };

  // Style preview (PreviewStylist): stream + final JSON
  const stylePreviewViaAgent = async () => {
    setPreviewAgentMessage("");
    setPreviewLoading(true);
    try {
      const parts: string[] = [];
      if (previewUserPrompt?.trim()) parts.push(previewUserPrompt.trim());
      if (chosenLogo) parts.push(`logo: selected`);
      parts.push(`overlay: x=${logoOverlay.x}, y=${logoOverlay.y}, scale=${logoOverlay.scale}, bg=${logoOverlay.bg}`);
      const inputText = parts.join('. ');

      const chat_history: AgencyMessage[] = [
        ...previewChatHistory.map(m => ({ role: m.role, content: m.text } as AgencyMessage)),
        { role: 'user', content: inputText }
      ];

      const payload = {
        recipient_agent: "PreviewStylist",
        message: inputText,
        chat_history,
        file_ids: null,
        file_urls: null,
        additional_instructions: null,
      };

      setPreviewChatHistory(prev => [...prev, { role: 'user', text: inputText }]);
      await streamAgencyRespond(payload, ({ type, message }) => {
        if (type === 'delta') {
          setPreviewAgentMessage(prev => prev ? `${prev}${message}` : message);
        } else if (type === 'message') {
          setPreviewAgentMessage(message || '');
        }
      });

      const jr = await postAgencyRespond(payload);
      const j = jr?.data ?? jr;
      let agentText = extractMessageFromSSE(j?.message || j?.data?.message || '');
      let parsedInner: any = null;
      if (agentText && typeof agentText === 'string') {
        try { parsedInner = JSON.parse(agentText); } catch(_) { parsedInner = null; }
      } else if (typeof agentText === 'object' && agentText) {
        parsedInner = agentText;
      }
      if (parsedInner && parsedInner.message) {
        agentText = parsedInner.message;
      }
      let controls: any = null;
      if (parsedInner) {
        controls = parsedInner.overlay_controls || parsedInner.controls || null;
      }
      if (!controls) {
        controls = j?.overlay_controls || j?.data?.overlay_controls || null;
      }
      if (controls) {
        setLogoOverlay(v => ({
          x: Math.max(0, Math.min(100, Number(controls.x ?? v.x))),
          y: Math.max(0, Math.min(100, Number(controls.y ?? v.y))),
          scale: Math.max(0.5, Math.min(3, Number(controls.scale ?? v.scale))),
          bg: controls.bg === 'dark' ? 'dark' : controls.bg === 'light' ? 'light' : v.bg,
        }));
      }
      setPreviewAgentMessage(agentText || "");
      setPreviewChatHistory(prev => [...prev, { role: 'assistant', text: agentText || 'Adjusted the overlay based on your request.' }]);
    } catch (e:any) {
      setPreviewAgentMessage(e?.message || 'Failed to style preview. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Estimate profit (ProfitEstimator): stream + final JSON
  const estimateProfitViaAgent = async () => {
    setProfitAgentMessage("");
    setProfitLoading(true);
    try {
      const parts: string[] = [];
      if (profitUserPrompt?.trim()) parts.push(profitUserPrompt.trim());
      parts.push(`base: ${profit.base}, retail: ${profit.retail}, followers: ${profit.followers}, conv: ${profit.conv}`);
      const inputText = parts.join('. ');

      const chat_history: AgencyMessage[] = [
        ...profitChatHistory.map(m => ({ role: m.role, content: m.text } as AgencyMessage)),
        { role: 'user', content: inputText }
      ];

      const payload = {
        recipient_agent: "ProfitEstimator",
        input: inputText,
        context: { brandName, industry, vibe, profit },
        params: { output: "estimate", format: "json" },
        structured_output: true,
        chat_history,
      };

      setProfitChatHistory(prev => [...prev, { role: 'user', text: inputText }]);
      await streamAgencyRespond(payload, ({ type, message }) => {
        if (type === 'delta') {
          setProfitAgentMessage(prev => prev ? `${prev}${message}` : message);
        } else if (type === 'message') {
          setProfitAgentMessage(message || '');
        }
      });

      const jr = await postAgencyRespond(payload);
      const j = jr?.data ?? jr;
      let agentText = extractMessageFromSSE(j?.message || j?.data?.message || '');
      let parsedInner: any = null;
      if (agentText && typeof agentText === 'string') {
        try { parsedInner = JSON.parse(agentText); } catch(_) { parsedInner = null; }
      } else if (typeof agentText === 'object' && agentText) {
        parsedInner = agentText;
      }
      if (parsedInner && parsedInner.message) {
        agentText = parsedInner.message;
      }
      let est: any = null;
      if (parsedInner) {
        est = parsedInner.estimate || parsedInner.estimates || null;
      }
      if (!est) {
        est = j?.estimate || j?.data?.estimate || null;
      }
      if (est && typeof est === 'object') {
        const units = Number(est.estUnits ?? est.units ?? 0);
        const profitVal = Number(est.estProfit ?? est.profit ?? 0);
        setProfit({ ...profit, estUnits: units, estProfit: profitVal });
      }
      setProfitAgentMessage(agentText || "");
      setProfitChatHistory(prev => [...prev, { role: 'assistant', text: agentText || 'Estimated units and profit based on your inputs.' }]);
    } catch (e:any) {
      setProfitAgentMessage(e?.message || 'Failed to estimate profit. Please try again.');
    } finally {
      setProfitLoading(false);
    }
  };

  const handleSocialAnalyze = () => {
    if (socialLoading) return;
    void analyzeSocialViaAgent();
  };

  const handleSocialRefine = () => {
    if (socialLoading) return;
    if (!socialRefinePrompt.trim()) return;
    void analyzeSocialViaAgent(socialRefinePrompt);
    setSocialRefinePrompt('');
  };

  const handleSocialContinue = () => {
    if (socialLoading) return;
    if (!socialScanSucceeded) return;
    setStep("loading2");
  };

  useEffect(() => {
    if (step === 'form') {
      setSocialIntroMessage('');
      setSocialAgentMessage('');
      setSocialHelpers([]);
      setSocialChatHistory([]);
    }
  }, [step]);

  return (
  <div className={`wizard w-full flex justify-center ${step === "form" ? "" : "bg-gradient-to-b from-[#1ae7f6]/10 to-white"} py-12`}>
      <div className="w-full max-w-5xl p-6 md:p-10">
        <AnimatePresence mode="popLayout">

          {step === "form" && (
            <StepPanel key="form">
              <h1 className="hero-animate text-3xl md:text-5xl font-semibold text-center leading-tight">
                Hi, I'm 
                <motion.span
                  className="inline-flex items-center gap-2"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                >
                  <span className="text-[#006F74]">Brand Wizard</span>
                  <Sparkles className="h-6 w-6 text-[#006F74]"/>
                </motion.span>
                , your AI‑powered assistant.
                <br/>
                <TypingText text="Let's start your brand." speed={22} className="text-gray-700" />
              </h1>
              <p className="mt-4 text-center text-gray-600 max-w-2xl mx-auto">Create your session so we can save progress and pick up anytime.</p>
              <div className="mt-8 grid md:grid-cols-3 gap-3 max-w-4xl mx-auto">
                <StandardTextInput
                  value={user.name}
                  onChange={(v)=>setUser({...user, name:v})}
                  placeholder="Name"
                  required
                  maxLength={60}
                />
                <StandardTextInput
                  value={user.email}
                  onChange={(v)=>setUser({...user, email:v})}
                  placeholder="Email"
                  required
                  type="email"
                  maxLength={120}
                  validate={(v)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : (v?"Enter a valid email address.":null)}
                />
                <StandardTextInput
                  value={user.ig}
                  onChange={(v)=>setUser({...user, ig:v})}
                  placeholder="Instagram (optional)"
                  maxLength={30}
                  validate={(v)=>!v || /^[A-Za-z0-9._]{1,30}$/.test(v) ? null : "Only letters, numbers, dot, and underscore are allowed."}
                />
              </div>
              <div className="mt-8 flex justify-center">
                <PrimaryButton onClick={()=> setStep("loading1")} disabled={!user.name.trim() || !user.email.trim()}>Create & Continue</PrimaryButton>
              </div>
            </StepPanel>
          )}

          {step === "loading1" && (
            <LoadingScreen key="loading1" title="Setting up your session" subtitle="One sec while I get things ready…" />
          )}

          {step === "social" && (
            <StepPanel key="social">
              <h2 className="text-2xl md:text-3xl font-semibold text-center mt-4">Vision Input / Social Scan</h2>
              <AgentIntroWidget
                introMessage={socialIntroMessage}
                introError={socialIntroError}
              />
              <div className="mt-6 max-w-3xl mx-auto">
                <StandardTextInput
                  value={socialUserPrompt}
                  onChange={(v)=>setSocialUserPrompt(v)}
                  placeholder="Type your brand vision (e.g., 'Luxury beauty, soft gold, Gen Z wellness')"
                  maxLength={200}
                  multiline
                  className="text-lg"
                />
                <p className="mt-2 text-center text-md text-slate-500">Tip: {tips[currentTipIndex].replace(/^Tip:\s*/i, '')}</p>
                <AgentMessageWidget
                  streamingText={socialStreamingText}
                  finalMessage={socialFinalMessage}
                  loading={socialLoading}
                  loadingText="Analyzing your brand vision…"
                />
                {socialFinalMessage && (
                  <RefinementWidget
                    refinePrompt={socialRefinePrompt}
                    onRefinePromptChange={setSocialRefinePrompt}
                    onRefine={handleSocialRefine}
                    loading={socialLoading}
                    placeholder="Tell BrandVision how to adjust the vision (tone, audience, specifics)"
                    refineButtonText="Refine Vision"
                  />
                )}
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <SecondaryButton onClick={()=>setStep("form")}>Back</SecondaryButton>
                <div className="flex flex-wrap gap-3 justify-end">
                  <button
                    type="button"
                    onClick={handleSocialAnalyze}
                    disabled={socialLoading || (!vibe.trim() && !user.ig.trim())}
                    className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {socialLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing…
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Analyze Vision
                      </>
                    )}
                  </button>
                  <PrimaryButton onClick={handleSocialContinue} disabled={!socialScanSucceeded || socialLoading}>Continue</PrimaryButton>
                </div>
              </div>
            </StepPanel>
          )}

          {step === "loading2" && (<LoadingScreen key="loading2" title="Analyzing vibe & audience" subtitle="Picking good directions…" />)}

          {step === "name" && (
            <StepPanel key="name">
              <h2 className="text-2xl md:text-3xl font-semibold text-center mt-4">Brand Name Selection</h2>
              <AgentIntroWidget
                introMessage={nameIntroMessage}
                introError={nameIntroError}
                loadingText="Getting your brand name ready…"
              />
              <div className="mt-6 max-w-3xl mx-auto">
                <StandardTextInput
                  value={nameUserPrompt}
                  onChange={(v)=>setNameUserPrompt(v)}
                  placeholder="Type your naming preferences (e.g., 'short, playful, available .com')"
                  maxLength={200}
                  multiline
                  className="text-lg"
                />
                <p className="mt-2 text-center text-md text-slate-500">Tip: {tips[currentTipIndex].replace(/^Tip:\s*/i, '')}</p>
                <AgentMessageWidget
                  streamingText={nameStreamingText}
                  finalMessage={nameFinalMessage}
                  loading={nameLoading}
                  loadingText="Analyzing your naming preferences…"
                />
                {nameFinalMessage && (
                  <RefinementWidget
                    refinePrompt={nameRefinePrompt}
                    onRefinePromptChange={setNameRefinePrompt}
                    onRefine={handleNameRefine}
                    loading={nameLoading}
                    placeholder="Tell NameSelector how to adjust the suggestions (tone, length, style)"
                    refineButtonText="Refine Names"
                  />
                )}
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <SecondaryButton onClick={()=>setStep("social")}>Back</SecondaryButton>
                <div className="flex flex-wrap gap-3 justify-end">
                  <button
                    type="button"
                    onClick={handleNameAnalyze}
                    disabled={nameLoading || (!vibe.trim() && !user.ig.trim())}
                    className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {nameLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing…
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Analyze Names
                      </>
                    )}
                  </button>
                  <PrimaryButton onClick={handleNameContinue} disabled={!nameScanSucceeded || nameLoading}>Continue</PrimaryButton>
                </div>
              </div>
            </StepPanel>
          )}

          {step === "loading3" && (<LoadingScreen key="loading3" title="Locking in your name" subtitle="Setting up palettes…" />)}

          {step === "palette" && (
            <StepPanel key="palette">
              <h2 className="text-2xl md:text-3xl font-semibold text-center mt-4">Color Palette</h2>
              <AgentIntroWidget
                introMessage={paletteIntroMessage}
                introError={paletteIntroError}
                loadingText={paletteIntroLoading ? paletteIntroLoadingText : undefined}
              />
              <div className="mt-6 max-w-3xl mx-auto">
                <StandardTextInput
                  value={paletteUserPrompt}
                  onChange={(v)=>setPaletteUserPrompt(v)}
                  placeholder="Type your color preferences (e.g., 'warm sunset colors, princess vibes, soft pastels')"
                  maxLength={200}
                  multiline
                  className="text-lg"
                />
                <p className="mt-2 text-center text-md text-slate-500">Tip: {tips[currentTipIndex].replace(/^Tip:\s*/i, '')}</p>
                <AgentMessageWidget
                  streamingText={paletteStreamingText}
                  finalMessage={paletteFinalMessage}
                  loading={paletteLoading}
                  loadingText="Analyzing your color preferences…"
                />
              </div>
              {paletteSelected && paletteColors.length > 0 && (
                <div className="mt-6 max-w-3xl mx-auto text-center">
                  <div className="flex justify-center gap-2">
                    {paletteColors.map(c => (
                      <div key={c} className="flex flex-col items-center">
                        <div className="h-12 w-12 rounded" style={{background:c}}></div>
                        <span className="text-xs mt-1">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {paletteFinalMessage && (
                <div className="mt-6 max-w-3xl mx-auto">
                  <RefinementWidget
                    refinePrompt={paletteRefinePrompt}
                    onRefinePromptChange={setPaletteRefinePrompt}
                    onRefine={handlePaletteRefine}
                    loading={paletteLoading}
                    placeholder="Tell ColorPaletteSelector how to adjust the palette (tones, brightness, style)"
                    refineButtonText="Refine Palette"
                  />
                </div>
              )}
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <SecondaryButton onClick={()=>setStep("name")}>Back</SecondaryButton>
                <div className="flex flex-wrap gap-3 justify-end">
                  <button
                    type="button"
                    onClick={handlePaletteAnalyze}
                    disabled={paletteLoading}
                    className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {paletteLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing…
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Analyze Colors
                      </>
                    )}
                  </button>
                  <PrimaryButton onClick={handlePaletteContinue} disabled={!paletteScanSucceeded || paletteLoading}>Continue</PrimaryButton>
                </div>
              </div>
            </StepPanel>
          )}

          {step === "loading4" && (<LoadingScreen key="loading4" title="Queuing logo generation" subtitle="This can take a few seconds…" />)}

          {step === "logo" && (
            <StepPanel key="logo">
              <h2 className="text-2xl md:text-3xl font-semibold text-center mt-4">Logo Generation</h2>
              <AgentIntroWidget
                introMessage={logoIntroMessage}
                introError={logoIntroError}
                loadingText="Preparing logo guidance…"
              />
              <div className="mt-4 max-w-3xl mx-auto">
                <label className="block text-sm font-medium text-gray-700 mb-1">logo details</label>
                {/* Standardized text area for Vision Input */}
                <StandardTextInput
                  value={logoUserPrompt}
                  onChange={(v)=>setLogoUserPrompt(v)}
                  placeholder="logo description"
                  multiline
                  maxLength={500}
                  className="focus:ring-purple-400"
                />
              </div>
              {/* Styles selection moved into boxed column below per request */}
              {/* Removed dedicated FAL image prompt per request; fal.ai generation will use the main logo details above. */}
              <div className="mt-4 grid md:grid-cols-3 gap-3 max-w-3xl mx-auto">
                {/* Styles box (replaces Icon Style) */}
                <div className="rounded-2xl border p-4">
                  <div className="font-medium">Styles</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {styleSeeds.map(s => (
                      <button
                        key={s}
                        onClick={() => setLogoStyles(prev => prev.includes(s) ? prev.filter(x=>x!==s) : [...prev, s])}
                        className={`rounded-full border px-3 py-1 text-sm ${logoStyles.includes(s)?"border-black":""}`}
                      >{s}</button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="font-medium">Typography</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["Sans-serif","Serif","Script","Rounded","Monospace"].map(s => (
                      <button key={s} onClick={()=>setTypography(s)} className={`rounded-full border px-3 py-1 text-sm ${typography===s?"border-black":""}`}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="font-medium">Colors</div>
                  <div className="mt-2 flex gap-2 items-center">
                    {paletteColors.length ? paletteColors.map(c => (<div key={c} className="h-6 w-6 rounded" style={{background:c}}/>)) : <span className="text-sm text-gray-500">Use palette step above</span>}
                  </div>
                </div>
              </div>
              {/* Error messages are intentionally suppressed in the logo step to ensure the final deliverable remains clean and free of UI error overlays. Errors are handled via silent retries and internal logging. */}
              <div className="mt-4 flex justify-center gap-3">
                <PrimaryButton onClick={async()=>{ await generateLogoOptionsViaAgent(3); }} disabled={logoLoading || (!paletteColors || !paletteColors.length)}>
                  {logoLoading ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin"/> Generating…
                    </>
                  ) : (
                    <>
                      {logoOptions.length > 0 ? 'Generate 3' : 'Generate'}
                    </>
                  )}
                </PrimaryButton>
              </div>
              {(logoAgentMessage || logoLoading) && (
                <div className="mt-6 max-w-3xl mx-auto">
                  <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-cyan-600">
                      <Sparkles className="h-4 w-4" />
                      <span>Agent Response</span>
                    </div>
                    <div className="mt-2 text-sm text-cyan-800 whitespace-pre-line min-h-[48px]">
                      {logoAgentMessage || (logoLoading ? 'Generating logo directions…' : '')}
                    </div>
                  </div>
                </div>
              )}
              {/* Error handling: display user-facing errors without debug comments */}
              {logoError && (
                <div className="mt-3 max-w-3xl mx-auto p-2 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
                  {logoError}
                </div>
              )}
              {!!logoOptions.length && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {logoOptions.map((src)=> (
        <div key={src} className={`rounded-xl border overflow-hidden hover:shadow-sm ${chosenLogo===src?"ring-2 ring-[#1ae7f6]":""}`}>
                      <img src={src} alt="logo" className="w-full h-auto" loading="lazy" decoding="async" fetchPriority="low" sizes="(max-width: 768px) 100vw, 1024px" />
                      <div className="p-2 flex items-center justify-between">
                        <button className="rounded-xl px-3 py-1 border inline-flex items-center gap-2" onClick={()=>setChosenLogo(src)}>
                          <i className="fi fi-rr-check"></i>
                          Use this
                        </button>
                        <button className="rounded-xl px-3 py-1 border inline-flex items-center gap-2" onClick={()=>downloadImage(src)}>
                          <i className="fi fi-rr-download"></i>
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-8 flex items-center justify-between">
                <SecondaryButton onClick={()=>setStep("palette")}>Back</SecondaryButton>
                <PrimaryButton onClick={()=>setStep("loading5")} disabled={!chosenLogo}>Continue</PrimaryButton>
              </div>
            </StepPanel>
          )}

          {step === "loading5" && (<LoadingScreen key="loading5" title="Preparing products" subtitle="Fetching categories & SKUs…" />)}

          {step === "product" && (
            <StepPanel key="product">
              <h2 className="text-2xl md:text-3xl font-semibold text-center">Product Selection</h2>
              <p className="mt-2 text-center text-gray-600">Choose a category, then pick a SKU.</p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {Categories.map(c => (
                  <button key={c.id} onClick={()=>setCategory(c.id)} className={`rounded-full border px-3 py-1 text-sm ${category===c.id?"border-black":""}`}>{c.label}</button>
                ))}
              </div>
              <div className="mt-6 grid md:grid-cols-2 gap-4">
                {SKUs.filter(s=>s.category===category).map(p => (
        <div key={p.sku} className={`rounded-2xl border p-4 ${sku===p.sku?"ring-2 ring-[#1ae7f6]":""}`}>
                    <div className="font-medium">{p.title}</div>
                    <div className="text-sm text-gray-500">{p.blurb}</div>
                    <div className="pt-2"><button className="rounded-xl px-3 py-2 border" onClick={()=>setSku(p.sku)}>Select</button></div>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex items-center justify-between">
                <SecondaryButton onClick={()=>setStep("logo")}>Back</SecondaryButton>
                <PrimaryButton onClick={async()=>{
                  if(!sku || !chosenLogo) return;
                  const r = await MockAPI.preview({ sku, logo: chosenLogo });
                  setPreviews(r.images);
                  setStep("loading6");
                }} disabled={!sku}>Continue</PrimaryButton>
              </div>
            </StepPanel>
          )}

          {step === "loading6" && (<LoadingScreen key="loading6" title="Rendering your mock‑up" subtitle="Applying your logo to the product…" />)}

          {step === "preview" && (
            <StepPanel key="preview">
              <h2 className="text-2xl md:text-3xl font-semibold text-center">Mock‑Up Preview</h2>
              <p className="mt-2 text-center text-gray-600">Nudge controls for quick tweaks.</p>
              <div className="mt-6 grid md:grid-cols-2 gap-4">
                {previews.map((src)=> (
                  <div key={src} className={`rounded-2xl border overflow-hidden relative ${logoOverlay.bg==='dark'?'bg-black':'bg-white'}`}>
                    <img src={src} alt="preview" className="w-full h-auto" width="1024" height="1024" decoding="async" fetchPriority="high" sizes="(max-width: 768px) 100vw, 1024px" style={{ filter: logoOverlay.bg==='dark' ? 'brightness(0.85)' : 'brightness(1)' }} />
                    {chosenLogo && (
                      <img
                        src={chosenLogo}
                        alt="logo overlay"
                        className="absolute"
                        decoding="async"
                        style={{
                          top: `${logoOverlay.y}%`,
                          left: `${logoOverlay.x}%`,
                          transform: `translate(-50%, -50%) scale(${logoOverlay.scale})`,
                          width: '40%',
                          opacity: 0.95,
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                <Chip onClick={()=> setLogoOverlay(v => ({...v, y: Math.max(0, v.y - 5)}))}>Logo ↑</Chip>
                <Chip onClick={()=> setLogoOverlay(v => ({...v, y: Math.min(100, v.y + 5)}))}>Logo ↓</Chip>
                <Chip onClick={()=> setLogoOverlay(v => ({...v, scale: Math.min(3, Number((v.scale * 1.1).toFixed(2)))}))}>Logo Bigger</Chip>
                <Chip onClick={()=> setLogoOverlay(v => ({...v, scale: Math.max(0.5, Number((v.scale * 0.9).toFixed(2)))}))}>Logo Smaller</Chip>
                <Chip onClick={()=> setLogoOverlay(v => ({...v, bg:'dark'}))}>BG: Dark</Chip>
                <Chip onClick={()=> setLogoOverlay(v => ({...v, bg:'light'}))}>BG: Light</Chip>
              </div>
              <div className="mt-8 flex items-center justify-between">
                <SecondaryButton onClick={()=>setStep("product")}>Back</SecondaryButton>
                <PrimaryButton onClick={()=>setStep("loading7")}>Looks Good</PrimaryButton>
              </div>
            </StepPanel>
          )}

          {step === "loading7" && (<LoadingScreen key="loading7" title="Calculating profit" subtitle="Crunching your numbers…" />)}

          {step === "profit" && (
            <StepPanel key="profit">
              <h2 className="text-2xl md:text-3xl font-semibold text-center">Profit Calculator</h2>
              <p className="mt-2 text-center text-gray-600">Adjust inputs to see your estimate.</p>
              <div className="mt-6 grid md:grid-cols-4 gap-3">
                <LabeledNumber label="Base Cost" value={profit.base} onChange={(n)=>setProfit({...profit, base:n})} />
                <LabeledNumber label="Retail" value={profit.retail} onChange={(n)=>setProfit({...profit, retail:n})} />
                <LabeledNumber label="Followers" value={profit.followers} onChange={(n)=>setProfit({...profit, followers:n})} />
                <LabeledNumber label="Conv %" value={profit.conv} onChange={(n)=>setProfit({...profit, conv:n})} />
              </div>
              <div className="mt-3 flex gap-2 justify-center">
                {[0.01, 0.02, 0.03, 0.05].map(c=> (
                  <button key={c} className="rounded-full border px-3 py-1 text-sm" onClick={()=>setProfit({...profit, conv:c})}>{Math.round(c*100)}%</button>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between">
                <SecondaryButton onClick={()=>setStep("preview")}>Back</SecondaryButton>
                <PrimaryButton onClick={async()=>{
                  const r = await MockAPI.estimate(profit);
                  setProfit({...profit, estUnits:r.estUnits, estProfit:r.estProfit});
                  setStep("loading8");
                }}>Estimate</PrimaryButton>
              </div>
              {profit.estUnits!==undefined && (
                <div className="mt-6 grid md:grid-cols-2 gap-4">
                  <Stat title="Estimated Units" value={profit.estUnits!.toLocaleString()} />
                  <Stat title="Estimated Profit" value={`$${profit.estProfit!.toLocaleString()}`} />
                </div>
              )}
            </StepPanel>
          )}

          {step === "loading8" && (<LoadingScreen key="loading8" title="Opening booking" subtitle="Fetching calendar slots…" />)}

          {step === "book" && (
            <StepPanel key="book">
              <h2 className="text-2xl md:text-3xl font-semibold text-center">Book a Call</h2>
              <p className="mt-2 text-center text-gray-600">Pick a GHL calendar slot. We'll email a summary with your assets.</p>
              <div className="mt-6">
                <iframe
                  id={BOOKING_IFRAME_ID}
                  src={BOOKING_IFRAME_SRC}
                  title="LeadConnector Calendar Booking"
                  style={{ width: '100%', border: 'none', minHeight: 900, overflow: 'hidden' }}
                ></iframe>
              </div>
              <div className="mt-8 flex items-center justify-between">
                <SecondaryButton onClick={()=>setStep("profit")}>Back</SecondaryButton>
                <PrimaryButton onClick={()=>setStep("done")}>Confirm</PrimaryButton>
              </div>
            </StepPanel>
          )}

          {step === "done" && (
            <StepPanel key="done">
              <h2 className="text-2xl md:text-3xl font-semibold text-center">All set 🎉</h2>
              <p className="mt-2 text-center text-gray-600">We'll send your brand summary and assets to {user.email}.</p>
              <div className="mt-8 flex justify-center gap-3">
                <SecondaryButton onClick={()=>setStep("form")}>Start Over</SecondaryButton>
                <PrimaryButton onClick={()=>alert("Finish")}>Finish</PrimaryButton>
              </div>
            </StepPanel>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// Standardized text input component for consistent styling, validation, and error handling across the app
function StandardTextInput({
  value,
  onChange,
  placeholder = "",
  required = false,
  maxLength,
  validate,
  multiline = false,
  name,
  type = "text",
  className = "",
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  validate?: (v: string) => string | null;
  multiline?: boolean;
  name?: string;
  type?: string;
  className?: string;
  error?: string;
}) {
  const baseClasses = "w-full rounded-xl px-4 py-3 bg-[#1ae7f6]/10 focus:ring-2 focus:ring-[#1ae7f6]";
  const [localError, setLocalError] = useState<string>("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    let msg = "";
    if (required && !v.trim()) msg = "This field is required.";
    if (!msg && validate) {
      const m = validate(v);
      if (m) msg = m;
    }
    setLocalError(msg);
    onChange(v);
  };

  const errorMsg = error || localError;
  const cls = `${baseClasses} ${errorMsg ? "border border-red-300 focus:ring-red-500" : ""} ${className}`.trim();

  return (
    <div>
      {multiline ? (
        <textarea
          name={name}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className={cls}
          maxLength={maxLength}
          rows={3}
        />
      ) : (
        <input
          name={name}
          type={type}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className={cls}
          maxLength={maxLength}
        />
      )}
      {errorMsg ? (
        <p className="mt-1 text-xs text-red-600">{errorMsg}</p>
      ) : null}
    </div>
  );
}
function getDynamicSuggestions(input: string, showMore:boolean): string[] {
  const basePrimary = [
    "Clean, minimalist, tech-forward",
    "Bold fitness, neon accents",
    "Luxury beauty, soft gold + serif",
    "Eco, earthy, natural",
    "Streetwear, edgy, high-contrast",
    "Playful, colorful, friendly",
  ];
  const baseSecondary = [
    "Modern, sleek, professional",
    "Vintage, retro, nostalgic",
    "Artistic, creative, expressive",
    "Sporty, energetic, dynamic",
    "Elegant, sophisticated, timeless",
    "Fun, quirky, whimsical",
  ];

  const text = (input || "").toLowerCase();
  const suggestions: string[] = [];
  const push = (s:string)=>{ if(!suggestions.includes(s)) suggestions.push(s); };

  // Keyword mappings
  if(/fitness|gym|athlet|workout|wellness/.test(text)) push("Bold fitness, neon accents");
  if(/luxury|luxe|premium|gold|beauty|glow|serum/.test(text)) push("Luxury beauty, soft gold + serif");
  if(/eco|earth|organic|sustain|natural|green|plant/.test(text)) push("Eco, earthy, natural");
  if(/streetwear|urban|edgy|grunge|high\s*contrast|skate/.test(text)) push("Streetwear, edgy, high-contrast");
  if(/playful|fun|colorful|vibrant|friendly|youth|gen\s*z/.test(text)) push("Playful, colorful, friendly");
  if(/minimal|clean|modern|tech|startup|sleek/.test(text)) push("Clean, minimalist, tech-forward");

  // Secondary mappings
  if(/modern|sleek|professional|corporate/.test(text)) push("Modern, sleek, professional");
  if(/vintage|retro|nostalg/.test(text)) push("Vintage, retro, nostalgic");
  if(/art|creative|expressive|artistic|design/.test(text)) push("Artistic, creative, expressive");
  if(/sport|energetic|dynamic|active/.test(text)) push("Sporty, energetic, dynamic");
  if(/elegant|sophisticated|timeless|classic/.test(text)) push("Elegant, sophisticated, timeless");
  if(/quirky|whimsical|playful/.test(text)) push("Fun, quirky, whimsical");

  // Fallbacks if no match
  if(suggestions.length === 0) {
    basePrimary.forEach(push);
  }
  // Limit primary set to 6
  let result = suggestions.slice(0, 6);
  if(showMore) {
    // Append secondary defaults to broaden options
    baseSecondary.forEach(s => { if(!result.includes(s)) result.push(s); });
  }
  return result;
}

function getNameSuggestions(input: string, vibe: string, user:{name:string; email:string; ig:string}, showMore:boolean): string[] {
  const baseStems = ["Nova", "Skin", "Peak", "Leaf", "Vital", "Glow", "Aura", "Zen", "Pulse", "Eco", "Spark", "Luxe"];
  const suffixesPrimary = ["Lab", "Labs", "Haus", "Ritual", "Fuel", "Bloom", "Boost", "Vita", "Muse", "Essence"];
  const suffixesSecondary = ["Works", "Co", "HQ", "Studio", "Collective", "Craft", "Foundry"];
  const vibeHints = (vibe || "").toLowerCase();

  // Map vibe keywords to stems or suffixes
  const stemsFromVibe: string[] = [];
  if(/beauty|glow|skin|serum|cosmetic/.test(vibeHints)) stemsFromVibe.push("Glow", "Skin", "Muse", "Luxe");
  if(/eco|earth|green|sustain|natural|plant/.test(vibeHints)) stemsFromVibe.push("Leaf", "Eco", "Zen");
  if(/fitness|gym|athlet|vital|energy|performance/.test(vibeHints)) stemsFromVibe.push("Vital", "Pulse", "Peak");
  if(/tech|modern|future|spark|nova|startup/.test(vibeHints)) stemsFromVibe.push("Nova", "Spark");

  const nameSeed = (input || user?.name || "").trim();
  const seedBase = nameSeed ? nameSeed.split(/\s+|[-_]/).map(s=>s.replace(/[^a-z]/gi,'')).filter(Boolean) : [];
  const seedStem = seedBase.length ? seedBase[0] : (stemsFromVibe[0] || baseStems[0]);

  const primaryCombos = [seedStem, ...(stemsFromVibe.length?stemsFromVibe:baseStems)].flatMap(stem => suffixesPrimary.map(s => `${stem}${s}`));
  const secondaryCombos = [seedStem, ...(stemsFromVibe.length?stemsFromVibe:baseStems)].flatMap(stem => suffixesSecondary.map(s => `${stem}${s}`));

  const result = Array.from(new Set([...(primaryCombos.slice(0, 20)), ...(showMore ? secondaryCombos.slice(0, 20) : [])]));
  return result;
}

const sleep = (ms:number)=> new Promise(res=>setTimeout(res, ms));

const StepPanel = React.forwardRef<HTMLElement, { children: React.ReactNode }>(({ children }, ref) => {
  return (
    <motion.section
      ref={ref as any}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="bg-white/70 backdrop-blur rounded-3xl border p-6 md:p-10 shadow-sm"
    >
      {children}
    </motion.section>
  );
});

const LoadingScreen = React.forwardRef<HTMLElement, { title: string; subtitle?: string }>(({ title, subtitle }, ref) => {
  return (
    <StepPanel ref={ref as any}>
      <div className="flex flex-col items-center text-center py-12">
        <Loader2 className="h-10 w-10 animate-spin text-[#1ae7f6]"/>
        <h3 className="mt-4 text-xl md:text-2xl font-semibold">{title}</h3>
        {subtitle && <p className="mt-2 text-gray-600">{subtitle}</p>}
      </div>
    </StepPanel>
  );
});

function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className="btn btn-primary inline-flex items-center justify-center rounded-xl px-5 py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
      {children}
      <ChevronRight className="ml-2 h-4 w-4"/>
    </button>
  );
}

function SecondaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className="btn btn-secondary inline-flex items-center justify-center rounded-xl px-4 py-2">
      <ChevronLeft className="mr-2 h-4 w-4"/>
      {children}
    </button>
  );
}

// Typing animation for more AI-like feel
function TypingText({ text, speed = 30, className = "" }: { text: string; speed?: number; className?: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    let i = 0;
    const chars = Array.from(text);
    const id = setInterval(() => {
      i++;
      setShown(chars.slice(0, i).join(""));
      if (i >= chars.length) clearInterval(id);
    }, Math.max(10, speed));
    return () => clearInterval(id);
  }, [text, speed]);
  return <span className={className}>{shown}</span>;
}

// Subheader component (no animation), 14px via CSS .subheader
function Subheader({ text, colorClass = "text-gray-700" }: { text: string; colorClass?: string }) {
  return (
    <p className={`subheader text-center ${colorClass}`}>{text}</p>
  );
}

async function fetchFalImage(
  prompt: string,
  size: string = "1024x1024",
  opts?: { model?: string; guidance_scale?: number; num_inference_steps?: number; seed?: number }
): Promise<string> {
  // Use a relative WP endpoint so this works both in the preview server and inside the WordPress plugin
  // Route to root preview server (5500) when running under Vite dev/preview, else use relative path for WordPress/plugin
  const host = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost';
  const port = typeof window !== 'undefined' ? String(window.location.port) : '';
  const isLocalDevOrPreview = ['4173','5173','5174'].includes(port);
  const endpoint = isLocalDevOrPreview
    ? `http://${host}:5502/wp-json/agui-chat/v1/image/generate`
    : `/wp-json/agui-chat/v1/image/generate`;
  const payload: any = { prompt, size };
  // Enforce the allowed model only; ignore any incoming model override
  payload.model = 'fal-ai/flux-pro/v1/fill';
  if (typeof opts?.guidance_scale === 'number') payload.guidance_scale = opts.guidance_scale;
  if (typeof opts?.num_inference_steps === 'number') payload.num_inference_steps = opts.num_inference_steps;
  if (typeof opts?.seed === 'number') payload.seed = opts.seed;
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    throw new Error(`Fal.ai request failed: ${r.status}`);
  }
  const j = await r.json();
  if (!j?.ok || !j?.data?.image_url) {
    throw new Error('Invalid response from image generation backend');
  }
  return j.data.image_url as string;
}

async function downloadImage(url: string) {
  try {
    const r = await fetch(url, {
      headers: {
        // Prefer modern formats when available
        'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8'
      }
    });
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // Pick filename based on content-type
    const ct = blob.type || 'image/png';
    const ext = ct.includes('webp') ? 'webp' : ct.includes('jpeg') ? 'jpg' : ct.includes('png') ? 'png' : 'img';
    a.download = `logo.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    alert('Download failed. Please open the image and save manually.');
    window.open(url, '_blank');
  }
}

function normalizePaletteHexes(colors: string[] = []): string[] {
  return (colors || [])
    .map((c) => (colorMap[String(c).toLowerCase()] || c))
    .map((c) => {
      const value = String(c ?? '').trim();
      if (!value) return '';
      const withHash = value.startsWith('#') ? value : `#${value}`;
      return withHash.toUpperCase();
    })
    .filter((c) => /^#([0-9A-F]{3}|[0-9A-F]{6})$/.test(c));
}

function buildLogoPrompt({ brandName, industry, vibe, paletteColors, logoStyles, iconStyle, typography }: { brandName:string; industry:string; vibe:string; paletteColors:string[]; logoStyles:string[]; iconStyle:string; typography:string }): string {
  const parts: string[] = [];
  parts.push(`${brandName} logo`);
  if (industry?.trim()) parts.push(`for ${industry}`);
  if (vibe?.trim()) parts.push(`brand attributes: ${vibe}`);
  if (paletteColors?.length) {
    const primary = dominantPaletteColor(paletteColors);
    const secondary = paletteColors.filter(c => (colorMap[c.toLowerCase()] || c) !== primary);
    const primaryLabel = primary || paletteColors[0];
    const hexList = paletteColors.map(c => (colorMap[String(c).toLowerCase()] || c)).join(', ');
    parts.push(`COLOR SCHEME: PRIMARY must be ${primaryLabel} (use it predominantly across the mark).`);
    if (secondary.length) parts.push(`SECONDARY accents: ${secondary.join(', ')} (use subtly).`);
    parts.push(`STRICT COLOR LIST: Use ONLY these HEX colors across the logo: ${hexList}. No other hues permitted.`);
  }
  if (logoStyles?.length) parts.push(`style: ${logoStyles.join(', ')}`);
  // Icon Style removed from logo generation UI; omit from prompt composition
  if (typography?.trim()) parts.push(`typography: ${typography}`);
  parts.push(`minimalist, clean vector mark, high contrast, professional`);
  parts.push(`STRICT COLOR COMPLIANCE: prioritize primary color across shapes and typography; avoid deviating hues. Avoid violet/purple hues entirely.`);
  // Typography & spell-check directives (only when brandName provided)
  if (brandName?.trim()) {
    parts.push(`TYPOGRAPHY AND TEXT: Spell the brand name exactly as "${brandName}" with zero typos or extra characters. No substitutions, abbreviations, or added symbols. Maintain consistent kerning and tracking, clean baseline alignment, and balanced letter proportions. Keep stroke weights consistent across all characters, and use either all-uppercase or the specified case consistently.`);
  }
  // Icon-to-type harmony
  parts.push(`ICON-TO-TYPE HARMONY: Ensure the icon style matches the typographic treatment. Use matching stroke weights and corner radii, balanced visual mass, and consistent geometric language. Avoid cartoonish icons if typography is geometric, and avoid mismatched styles.`);
  // Style consistency across the mark
  parts.push(`STYLE CONSISTENCY: Maintain consistent style attributes (rounded vs sharp, flat vs gradient as appropriate). Keep visual proportions harmonious, spacing and alignment grid-consistent, and avoid disproportionate elements or misaligned baselines.`);
  // Error-free output requirements
  parts.push(`ERROR-FREE OUTPUT: No watermark, no UI overlays, and no error messages embedded in the image. Deliver a clean logo with a transparent background (or solid background if specified) suitable for production.`);
  // Validation hints and negative prompts
  parts.push(`VALIDATION: Re-check spelling of "${brandName}" before final render. Avoid misspellings, random text, extra symbols, drop shadows unless explicitly requested, inconsistent stroke thickness, and misaligned baselines.`);
  return parts.join('. ');
}

// Helper: Build a prompt tailored for fal.ai, allowing an optional user override to lead the description
function buildFalLogoPrompt({ brandName, industry, vibe, paletteColors, logoStyles, iconStyle, typography, overridePrompt }: { brandName:string; industry:string; vibe:string; paletteColors:string[]; logoStyles:string[]; iconStyle:string; typography:string; overridePrompt?: string }): string {
  const base = buildLogoPrompt({ brandName, industry, vibe, paletteColors, logoStyles, iconStyle, typography });
  if (overridePrompt && overridePrompt.trim()) {
    return `${overridePrompt.trim()}. ${base}`;
  }
  return base;
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick?: ()=>void }) {
  return <button onClick={onClick} className="rounded-full border px-3 py-1 text-sm hover:bg-[#1ae7f6]/10">{children}</button>;
}

function LabeledNumber({ label, value, onChange }: { label:string; value:number; onChange:(n:number)=>void }) {
  return (
    <label className="text-sm grid gap-1">
      <span className="text-gray-600">{label}</span>
      <input className="rounded-xl px-3 py-2 bg-[#1ae7f6]/10 focus:ring-2 focus:ring-[#1ae7f6]" value={value} onChange={(e)=>onChange(Number(e.target.value))} />
    </label>
  );
}

function Stat({ title, value }: { title:string; value:string }) {
  return (
    <div className="rounded-2xl border p-4 text-center">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}



