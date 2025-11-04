# Agency Stream Endpoint Documentation

## Endpoint: Agency Stream (Server-Sent Events)

Streams agent responses in real-time using Server-Sent Events (SSE) for a typing effect.

### Endpoint URL

**Production/WordPress:**
```
POST /wp-json/agui-chat/v1/agency/stream
```

**Development/Preview:**
```
POST http://localhost:5502/wp-json/agui-chat/v1/agency/stream
```

### Request Headers

```
Content-Type: application/json
Accept: text/event-stream
```

### Request Body

```json
{
  "recipient_agent": "LogoGenerator",
  "message": "logo description. styles: Futuristic, Minimalist. typography: Sans-serif. palette HEX: #0ea5e9, #0369a1, #111827. PRIMARY emphasis: #0ea5e9 with subtle accents: #0369a1, #111827. brand: MyBrand. industry: supplements. vibe: modern wellness",
  "chat_history": [
    {
      "role": "user",
      "content": "previous user message"
    },
    {
      "role": "assistant",
      "content": "previous assistant response"
    }
  ],
  "context": {
    "brandName": "MyBrand",
    "industry": "supplements",
    "vibe": "modern wellness"
  },
  "file_ids": null,
  "file_urls": null,
  "additional_instructions": null
}
```

### Request Body Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recipient_agent` | string | Yes | Agent name (e.g., "LogoGenerator", "ColorPaletteSelector", "NameSelector", "BrandVision", "ProductAdvisor", "PreviewStylist", "ProfitEstimator") |
| `message` | string | Yes | The user's message/input to the agent |
| `chat_history` | array | No | Previous conversation messages in format `[{ role: "user"|"assistant", content: string }]` |
| `context` | object | No | Additional context (e.g., `{ brandName, industry, vibe }`) |
| `file_ids` | array\|null | No | File IDs to attach |
| `file_urls` | array\|null | No | File URLs to attach |
| `additional_instructions` | string\|null | No | Additional instructions for the agent |

### Response Format

The endpoint returns a **Server-Sent Events (SSE)** stream. Each chunk follows this format:

```
data: <text or json>
```

**Example SSE stream:**
```
data: Okay! I'll generate three logo concepts

data: {"message": "that honor your selected palette"}

data: and styles.
```

### Response Processing

1. **Stream chunks**: Each line starting with `data:` contains text or JSON
2. **Text accumulation**: Text chunks are accumulated incrementally
3. **JSON parsing**: If a chunk is JSON with a `message` field, extract it
4. **Final text**: The accumulated text represents the complete agent message

### Example: JavaScript/TypeScript Client

```typescript
async function streamAgencyRespond(
  payload: any, 
  onChunk: (text: string) => void
): Promise<{ text: string }> {
  const endpoint = '/wp-json/agui-chat/v1/agency/stream';
  let aggregate = '';
  
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
    aggregate = txt;
    onChunk(aggregate);
    return { text: aggregate };
  }
  
  // Parse SSE stream
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split(/\r?\n/);
    
    for (const line of lines) {
      if (!line || !line.startsWith('data:')) continue;
      
      let data = line.slice(5).trim();
      
      // Try to parse JSON
      if (data) {
        try {
          const obj = JSON.parse(data);
          if (obj && typeof obj.message === 'string') {
            data = obj.message;
          }
        } catch (_) {
          // Not JSON, keep as text
        }
        
        aggregate += (aggregate ? '\n' : '') + data;
        onChunk(aggregate); // Call callback with accumulated text
      }
    }
  }
  
  return { text: aggregate };
}

// Usage example
const payload = {
  recipient_agent: "LogoGenerator",
  message: "Create a modern logo for a wellness brand",
  chat_history: [],
  context: { brandName: "WellnessCo", industry: "supplements", vibe: "modern" },
  file_ids: null,
  file_urls: null,
  additional_instructions: null,
};

await streamAgencyRespond(payload, (txt) => {
  console.log('Streaming:', txt);
  // Update UI with streaming text
});
```

### Example: cURL

```bash
curl -X POST \
  http://localhost:5502/wp-json/agui-chat/v1/agency/stream \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "recipient_agent": "LogoGenerator",
    "message": "Create a minimalist logo",
    "chat_history": [],
    "context": {
      "brandName": "TestBrand",
      "industry": "tech",
      "vibe": "modern"
    },
    "file_ids": null,
    "file_urls": null,
    "additional_instructions": null
  }'
```

### Example: Python Client

```python
import requests
import json

def stream_agency_respond(payload, on_chunk):
    endpoint = "http://localhost:5502/wp-json/agui-chat/v1/agency/stream"
    
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
    }
    
    response = requests.post(
        endpoint,
        headers=headers,
        json=payload,
        stream=True
    )
    
    response.raise_for_status()
    
    aggregate = ""
    for line in response.iter_lines():
        if line and line.startswith(b"data:"):
            data = line[5:].strip().decode("utf-8")
            
            # Try to parse JSON
            try:
                obj = json.loads(data)
                if isinstance(obj, dict) and "message" in obj:
                    data = obj["message"]
            except:
                pass
            
            aggregate += ("\n" if aggregate else "") + data
            on_chunk(aggregate)
    
    return {"text": aggregate}

# Usage
payload = {
    "recipient_agent": "LogoGenerator",
    "message": "Create a modern logo",
    "chat_history": [],
    "context": {"brandName": "TestBrand", "industry": "tech", "vibe": "modern"},
    "file_ids": None,
    "file_urls": None,
    "additional_instructions": None
}

def handle_chunk(text):
    print(f"Received: {text}")

result = stream_agency_respond(payload, handle_chunk)
print(f"Final: {result['text']}")
```

### Error Handling

- **400 Bad Request**: Missing required fields or invalid payload
- **502 Bad Gateway**: Upstream Agency backend unavailable
- **500 Internal Server Error**: Server processing error

Error responses may be in SSE format:
```
event: error
data: {"ok": false, "error": "Agency upstream SSE failed"}
```

### Notes

1. The endpoint proxies to the FastAPI Agency backend configured in WordPress settings
2. The stream accumulates text incrementally - each `onChunk` callback receives the full accumulated text so far
3. After streaming completes, you typically call the non-streaming `/agency/respond` endpoint to get the final structured response with logo URLs, structured data, etc.
4. The endpoint supports multiple agents: LogoGenerator, ColorPaletteSelector, NameSelector, BrandVision, ProductAdvisor, PreviewStylist, ProfitEstimator

### Related Endpoints

- **Non-streaming**: `POST /wp-json/agui-chat/v1/agency/respond` - Returns final structured JSON response
- **Image Generation**: `POST /wp-json/agui-chat/v1/image/generate` - Generate images via fal.ai

