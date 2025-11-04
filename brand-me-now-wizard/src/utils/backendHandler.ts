export type AgencyRole = 'user' | 'assistant';

export interface AgencyMessage {
  role: AgencyRole;
  content: string;
}

export interface AgencyPayload {
  recipient_agent: string;
  message?: string;
  input?: string;
  chat_history?: AgencyMessage[];
  context?: Record<string, unknown>;
  params?: Record<string, unknown>;
  structured_output?: boolean;
  file_ids?: string[] | null;
  file_urls?: string[] | null;
  additional_instructions?: string | null;
  [key: string]: unknown;
}

export type AgencyStreamChunk = {
  raw: string;
  type: 'message' | 'status' | 'delta';
  message: string;
};

function isLocalPreview(): boolean {
  if (typeof window === 'undefined') return false;
  const port = String(window.location.port || '');
  return ['4173', '5173'].includes(port);
}

function buildEndpoint(path: string): string {
  if (typeof window === 'undefined') {
    return path;
  }
  const host = window.location.hostname || 'localhost';
  return isLocalPreview() ? `http://${host}:5502${path}` : path;
}

export async function postAgencyRespond(payload: AgencyPayload): Promise<any> {
  const endpoint = buildEndpoint('/wp-json/agui-chat/v1/agency/respond');
  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      throw new Error(`Agency respond failed: ${r.status}`);
    }
    try {
      return await r.json();
    } catch (_) {
      // Some proxies may return plain text; expose raw string for debugging
      const txt = await r.text();
      return { ok: true, data: txt };
    }
  } catch (e) {
    // In preview mode we prefer failing silently so UI can fallback gracefully
    return { ok: true, data: {} };
  }
}

export async function streamAgencyRespond(
  payload: AgencyPayload,
  onChunk?: (chunk: AgencyStreamChunk) => void,
  options?: { stopOnFirstMessage?: boolean },
): Promise<{ text: string }> {
  const endpoint = buildEndpoint('/wp-json/agui-chat/v1/agency/stream');
  let aggregate = '';
  let buffer = '';
  let shouldStop = false;

  const emit = (chunk: AgencyStreamChunk) => {
    if (!onChunk) return;
    onChunk(chunk);
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Agency stream failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');

    if (!reader) {
      const txt = await response.text();
      const clean = extractMessageFromSSE(txt);
      aggregate = clean;
      emit({ raw: txt, type: 'message', message: clean });
      return { text: clean };
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line || !line.startsWith('data:')) continue;

        const rawPayload = line.slice(5).trim();
        if (!rawPayload) continue;
        const parsed = parseSSEPayload(rawPayload);

        if (parsed.type === 'delta') {
          if (parsed.message) aggregate += parsed.message;
        } else if (parsed.type === 'message') {
          aggregate = parsed.message || aggregate;
        }

        emit(parsed);
        if (options?.stopOnFirstMessage && (parsed.type === 'delta' || parsed.type === 'message')) {
          shouldStop = true;
          break;
        }
      }
      if (shouldStop) break;
    }

    const remainder = buffer.trim();
    if (remainder) {
      const parsed = parseSSEPayload(remainder);
      if (parsed.type === 'delta') {
        if (parsed.message) aggregate += parsed.message;
      } else if (parsed.type === 'message') {
        aggregate = parsed.message || aggregate;
      }
      emit(parsed);
      if (options?.stopOnFirstMessage && (parsed.type === 'delta' || parsed.type === 'message')) {
        shouldStop = true;
      }
    }

    if (shouldStop && reader) {
      try { await reader.cancel(); } catch (_) {/* ignore */}
    }

    return { text: aggregate };
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Agency stream failed', e);
    }
    return { text: aggregate };
  }
}

export async function requestAgencyResponse({
  payload,
  onStream,
}: {
  payload: AgencyPayload;
  onStream?: (text: string) => void;
}): Promise<{ message: string; helpers: string[] }> {
  let interim = '';

  const streamResult = await streamAgencyRespond(payload, (chunk) => {
    if (!onStream) return;
    if (chunk.type === 'delta') {
      interim += chunk.message || '';
      onStream(interim);
    } else if (chunk.type === 'message') {
      interim = chunk.message || interim;
      onStream(interim);
    }
  });

  const jr = await postAgencyRespond(payload);
  const j = jr?.data ?? jr;

  const streamed = streamResult?.text ? extractMessageFromSSE(streamResult.text) : interim;
  let agentText: any = extractMessageFromSSE(j?.message || j?.data?.message || streamed || interim);
  let parsed: any = null;

  if (agentText && typeof agentText === 'string') {
    try {
      parsed = JSON.parse(agentText);
    } catch (_) {
      parsed = null;
    }
  } else if (typeof agentText === 'object' && agentText) {
    parsed = agentText;
  }

  if (parsed && parsed.message) {
    agentText = parsed.message;
  }

  let helpers: string[] = [];
  if (parsed) {
    helpers = parsed.helper_suggestions || parsed.suggestions || [];
  }
  if (!Array.isArray(helpers) || !helpers.length) {
    const fallback = j?.helper_suggestions || j?.data?.helper_suggestions || [];
    if (Array.isArray(fallback)) helpers = fallback;
  }

  helpers = Array.isArray(helpers)
    ? Array.from(new Set(helpers.map((h) => String(h).trim()).filter(Boolean)))
    : [];

  const finalMessage = typeof agentText === 'string' && agentText.trim().length
    ? agentText
    : interim;

  return {
    message: finalMessage,
    helpers,
  };
}

export function extractMessageFromSSE(raw: string): string {
  if (!raw) return '';

  const pieces = raw
    .split(/\n+/)
    .map((part) => part.replace(/^data:\s*/i, '').trim())
    .filter(Boolean);

  const messages: string[] = [];

  for (const piece of pieces) {
    try {
      const parsed = JSON.parse(piece);
      if (parsed && typeof parsed === 'object') {
        const data = (parsed as any).data || parsed;
        const message = pickString(data?.message, data?.delta);
        if (message) {
          messages.push(message);
          continue;
        }
      }
    } catch (_) {
      // ignore JSON errors and fall back to raw string
    }
    messages.push(piece);
  }

  return messages.join('\n');
}

function parseSSEPayload(raw: string): AgencyStreamChunk {
  if (!raw) {
    return { raw, type: 'status', message: '' };
  }

  try {
    const parsed = JSON.parse(raw);
    const primary = (parsed && typeof parsed === 'object') ? parsed : {};
    const inner = (primary as any)?.data?.data ?? (primary as any)?.data ?? primary;

    const delta = pickString((inner as any)?.delta, (inner as any)?.data?.delta);
    if (delta) {
      return { raw, type: 'delta', message: delta };
    }

    const statusMessage = pickString(
      (inner as any)?.message,
      (inner as any)?.status,
      (inner as any)?.data?.message,
      (inner as any)?.data?.status,
      (primary as any)?.data?.message,
      (primary as any)?.data?.status,
    );
    const eventType = String((inner as any)?.type ?? (primary as any)?.data?.type ?? (primary as any)?.event ?? '').toLowerCase();
    if (statusMessage && (eventType.includes('status') || (inner as any)?.status)) {
      return { raw, type: 'status', message: statusMessage };
    }

    const textMessage = pickString(
      (inner as any)?.message,
      (inner as any)?.data?.message,
      (primary as any)?.message,
    );
    if (textMessage) {
      return { raw, type: 'message', message: textMessage };
    }
  } catch (_) {
    // swallow JSON parse errors and fall back to raw string
  }

  return { raw, type: 'status', message: '' };
}

function pickString(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length) {
      return value;
    }
  }
  return '';
}

