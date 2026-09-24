import "server-only";
import type {
  AssistantModel,
  ModelGenerateOptions,
  ModelGenerateResponse,
} from "./types";
import { MockAssistantModel } from "./mock-model";
import { GeminiFetchModel } from "./gemini-model";
import { OpenAIFetchModel } from "./openai-model";

export function validateBaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.length > 256) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function getAssistantModel(): AssistantModel {
  const provider = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const apiKey = (process.env.AI_API_KEY || "").trim();
  const modelName = (process.env.AI_MODEL || "").trim();
  const rawBaseUrl = process.env.AI_BASE_URL;

  const baseUrl = validateBaseUrl(rawBaseUrl);

  if (provider === "gemini") {
    if (!apiKey) {
      throw new Error("AI_API_KEY is required when AI_PROVIDER is 'gemini'");
    }
    return new GeminiFetchModel({
      apiKey,
      model: modelName || "gemini-2.0-flash",
      baseUrl: baseUrl || "https://generativelanguage.googleapis.com",
    });
  }

  if (provider === "openai") {
    if (!apiKey) {
      throw new Error("AI_API_KEY is required when AI_PROVIDER is 'openai'");
    }
    return new OpenAIFetchModel({
      apiKey,
      model: modelName || "gpt-4o-mini",
      baseUrl: baseUrl || "https://api.openai.com",
    });
  }

  if (provider === "mock" || !provider) {
    if (process.env.NODE_ENV === "production" && provider !== "mock") {
      throw new Error("AI_PROVIDER must be explicitly configured in production.");
    }
    return new MockAssistantModel();
  }

  throw new Error(`Unsupported AI_PROVIDER: '${provider}'`);
}

export type { AssistantModel, ModelGenerateOptions, ModelGenerateResponse };
