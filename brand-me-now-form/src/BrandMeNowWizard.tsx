import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, Wand2, ChevronRight, Check } from "lucide-react";

type SubmitState = "idle" | "submitting" | "success" | "error";

type StoredLead = {
  name: string;
  email: string;
  idea: string;
};

declare global {
  interface Window {
    BMN_FORM_CONFIG?: {
      wpFormEndpoint?: string;
    };
  }
}

const tips = [
  "Tip: Include details about your audience (e.g., Gen Z wellness) for better personalized results.",
  "Tip: Specify your brand's tone (e.g., professional, fun) for tailored suggestions.",
  "Tip: Add industry details for more relevant ideas.",
  "Tip: Describe your target market size for accurate projections.",
];

const INITIAL_LEAD: StoredLead = { name: "", email: "", idea: "" };

export function validateLead(payload: StoredLead) {
  const next: { name?: string; email?: string } = {};
  if (!payload.name.trim()) next.name = "This field is required.";
  const email = payload.email.trim();
  if (!email) {
    next.email = "This field is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    next.email = "Enter a valid email address.";
  }
  return next;
}

export default function BrandMeNowWizard() {
  const [lead, setLead] = useState<StoredLead>(() => {
    try {
      const saved = localStorage.getItem("bmnFormLead");
      return saved ? JSON.parse(saved) : INITIAL_LEAD;
    } catch (e) {
      return INITIAL_LEAD;
    }
  });
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [tipIndex, setTipIndex] = useState(0);
  const [status, setStatus] = useState<SubmitState>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");

  useEffect(() => {
    const id = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 9000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("bmnFormLead", JSON.stringify(lead));
    } catch (e) {
      // ignore write errors
    }
  }, [lead]);

  const wpConfig = useMemo(() => (typeof window !== "undefined" ? window.BMN_FORM_CONFIG ?? null : null), []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateLead(lead);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setStatus("submitting");
    setStatusMessage("");

    const body = {
      name: lead.name.trim(),
      email: lead.email.trim(),
      idea: lead.idea.trim(),
    };

    try {
      if (wpConfig?.wpFormEndpoint) {
        const resp = await fetch(wpConfig.wpFormEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          throw new Error(`Request failed with status ${resp.status}`);
        }
      } else {
        // Simulate network delay when endpoint is not available
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      setStatus("success");
      setStatusMessage("Thanks! You're on the list. We'll reach out with your brand kit shortly.");
    } catch (error) {
      console.error("Lead submission failed", error);
      setStatus("error");
      setStatusMessage("Something went wrong while saving your info. Please try again.");
    }
  };

  return (
    <div className="wizard w-full flex justify-center py-12 bg-gradient-to-b from-[#1ae7f6]/10 to-white">
      <div className="w-full max-w-5xl p-6 md:p-10">
        <StepPanel>
          <h1 className="hero-animate text-3xl md:text-5xl font-semibold text-center leading-tight">
            Hi, I'm
            <motion.span
              className="inline-flex items-center gap-2"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <span className="animated-gradient">Brand Wizard</span>
              <Sparkles className="h-6 w-6 text-[#006F74]" />
            </motion.span>
            , your AI-powered assistant.
            <br />
            <TypingText text="Let's start your brand." speed={22} className="text-gray-700" />
          </h1>
          <p className="mt-4 text-center text-gray-600 max-w-2xl mx-auto">
            Create your session so we can save progress and pick up anytime.
          </p>

          <form className="mt-8 grid md:grid-cols-3 gap-3 max-w-4xl mx-auto" onSubmit={handleSubmit}>
            <StandardTextInput
              value={lead.name}
              onChange={(value) => setLead((prev) => ({ ...prev, name: value }))}
              placeholder="Name"
              required
              maxLength={60}
              error={errors.name}
            />
            <StandardTextInput
              value={lead.email}
              onChange={(value) => setLead((prev) => ({ ...prev, email: value }))}
              placeholder="Email"
              required
              type="email"
              maxLength={120}
              error={errors.email}
            />
            <StandardTextInput
              value={lead.idea}
              onChange={(value) => setLead((prev) => ({ ...prev, idea: value }))}
              placeholder="Describe your brand idea"
              maxLength={200}
              multiline
            />
            <div className="md:col-span-3 mt-2 flex justify-center">
              <PrimaryButton type="submit" disabled={status === "submitting"}>
                {status === "submitting" ? (
                  <>
                    Saving
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  </>
                ) : (
                  <>Create & Continue</>
                )}
              </PrimaryButton>
            </div>
          </form>

          <div className="mt-6 max-w-xl mx-auto text-sm flex justify-center">
            <div className="tip-row flex items-center gap-2 text-gray-600">
              <Wand2 className="tip-icon" aria-hidden="true" />
              <AnimatePresence mode="wait">
                <motion.div
                  key={tipIndex}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                  className="tip-text"
                >
                  {tips[tipIndex]}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {status !== "idle" && statusMessage && (
            <div
              className={`mt-6 max-w-3xl mx-auto rounded-xl border px-4 py-3 text-sm md:text-base flex items-center justify-center gap-2 ${
                status === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {status === "success" ? <Check className="h-4 w-4" /> : null}
              {statusMessage}
            </div>
          )}
        </StepPanel>
      </div>
    </div>
  );
}

function StandardTextInput({
  value,
  onChange,
  placeholder = "",
  required = false,
  maxLength,
  multiline = false,
  type = "text",
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  multiline?: boolean;
  type?: string;
  error?: string;
}) {
  const baseClasses = "w-full rounded-xl px-4 py-3 bg-[#1ae7f6]/10 focus:ring-2 focus:ring-[#1ae7f6]";

  if (multiline) {
    return (
      <div className="md:col-span-3">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${baseClasses} ${error ? "border border-red-300 focus:ring-red-500" : ""}`.trim()}
          maxLength={maxLength}
          rows={3}
          required={required}
        />
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${baseClasses} ${error ? "border border-red-300 focus:ring-red-500" : ""}`.trim()}
        maxLength={maxLength}
        required={required}
        type={type}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function StepPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="bg-white/70 backdrop-blur rounded-3xl border p-6 md:p-10 shadow-sm"
    >
      {children}
    </motion.section>
  );
}

function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`btn btn-primary inline-flex items-center justify-center rounded-xl px-5 py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
        props.className ?? ""
      }`.trim()}
    >
      {children}
      <ChevronRight className="ml-2 h-4 w-4" />
    </button>
  );
}

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

