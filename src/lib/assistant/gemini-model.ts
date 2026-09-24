import "server-only";
import type {
  AssistantModel,
  ModelGenerateOptions,
  ModelGenerateResponse,
  ModelMessage,
  ModelToolDefinition,
} from "./types";

interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export class GeminiFetchModel implements AssistantModel {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: GeminiConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl;
  }

  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResponse> {
    const endpoint = `${this.baseUrl}/v1beta/models/${encodeURIComponent(
      this.model
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const systemMsg = options.messages.find((m) => m.role === "system");
    const dialogueMsgs = options.messages.filter((m) => m.role !== "system");

    const contents = dialogueMsgs.map((m) => this.mapMessage(m));

    const tools = options.tools && options.tools.length > 0
      ? [
          {
            functionDeclarations: options.tools.map((t) => this.mapTool(t)),
          },
        ]
      : undefined;

    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxOutputTokens ?? 1024,
      },
    };

    if (systemMsg) {
      requestBody.systemInstruction = {
        parts: [{ text: systemMsg.content }],
      };
    }

    if (tools) {
      requestBody.tools = tools;
    }

    const signal = options.signal || AbortSignal.timeout(15000);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini API error (status ${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    return this.parseGeminiResponse(data);
  }

  private mapMessage(m: ModelMessage) {
    if (m.role === "tool") {
      return {
        role: "function",
        parts: [
          {
            functionResponse: {
              name: m.toolCallId || "tool",
              response: { result: m.content },
            },
          },
        ],
      };
    }

    if (m.role === "assistant") {
      const parts: Array<Record<string, unknown>> = [];
      if (m.content) {
        parts.push({ text: m.content });
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        for (const tc of m.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          });
        }
      }
      return {
        role: "model",
        parts: parts.length > 0 ? parts : [{ text: "" }],
      };
    }

    return {
      role: "user",
      parts: [{ text: m.content }],
    };
  }

  private mapTool(t: ModelToolDefinition) {
    return {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    };
  }

  private parseGeminiResponse(data: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          functionCall?: {
            name: string;
            args?: Record<string, unknown>;
          };
        }>;
      };
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  }): ModelGenerateResponse {
    const candidate = data?.candidates?.[0];
    if (!candidate) {
      return {
        content: null,
        finishReason: "error",
      };
    }

    const parts = candidate.content?.parts || [];
    let textContent = "";
    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }> = [];

    for (const part of parts) {
      if (part.text) {
        textContent += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: part.functionCall.name,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        });
      }
    }

    return {
      content: textContent.trim() || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
      usage: data?.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount || 0,
            completionTokens: data.usageMetadata.candidatesTokenCount || 0,
            totalTokens: data.usageMetadata.totalTokenCount || 0,
          }
        : undefined,
    };
  }
}
