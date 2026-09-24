import "server-only";
import type {
  AssistantModel,
  ModelGenerateOptions,
  ModelGenerateResponse,
  ModelMessage,
  ModelToolDefinition,
} from "./types";

interface OpenAIConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export class OpenAIFetchModel implements AssistantModel {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl;
  }

  async generate(options: ModelGenerateOptions): Promise<ModelGenerateResponse> {
    const endpoint = `${this.baseUrl}/v1/chat/completions`;

    const messages = options.messages.map((m) => this.mapMessage(m));

    const tools = options.tools && options.tools.length > 0
      ? options.tools.map((t) => this.mapTool(t))
      : undefined;

    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxOutputTokens ?? 1024,
    };

    if (tools) {
      requestBody.tools = tools;
    }

    const signal = options.signal || AbortSignal.timeout(15000);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OpenAI API error (status ${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    return this.parseOpenAIResponse(data);
  }

  private mapMessage(m: ModelMessage): Record<string, unknown> {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.toolCallId || "tool",
        content: m.content,
      };
    }

    if (m.role === "assistant") {
      const obj: Record<string, unknown> = {
        role: "assistant",
        content: m.content || null,
      };
      if (m.toolCalls && m.toolCalls.length > 0) {
        obj.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }
      return obj;
    }

    return {
      role: m.role,
      content: m.content,
    };
  }

  private mapTool(t: ModelToolDefinition) {
    return {
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    };
  }

  private parseOpenAIResponse(data: {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          function?: {
            name: string;
            arguments?: string;
          };
        }>;
      };
      finish_reason?: string;
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }): ModelGenerateResponse {
    const choice = data?.choices?.[0];
    if (!choice) {
      return {
        content: null,
        finishReason: "error",
      };
    }

    const message = choice.message;
    if (!message) {
      return {
        content: null,
        finishReason: "error",
      };
    }

    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }> = [];

    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        if (!tc.function || !tc.function.name) continue;
        let parsedArgs = {};
        try {
          parsedArgs = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          parsedArgs = {};
        }
        toolCalls.push({
          id: tc.id || tc.function.name,
          name: tc.function.name,
          arguments: parsedArgs,
        });
      }
    }

    return {
      content: message.content ? String(message.content).trim() : null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: choice.finish_reason === "tool_calls" ? "tool_calls" : "stop",
      usage: data?.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          }
        : undefined,
    };
  }
}
