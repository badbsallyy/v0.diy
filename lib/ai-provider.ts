import Anthropic from "@anthropic-ai/sdk";
import {
  GoogleGenerativeAI,
  type GenerateContentStreamResult,
} from "@google/generative-ai";
import OpenAI from "openai";

// Supported AI providers
export type AIProviderType = "openai" | "gemini" | "claude";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CompletionConfig {
  temperature?: number;
  maxTokens?: number;
}

interface StreamChunk {
  content: string;
}

/**
 * Returns the currently active provider based on AI_PROVIDER env var
 * or falls back to whichever API key is available.
 */
export function getActiveProvider(requested?: string): AIProviderType {
  // Allow per-request override
  if (
    requested === "openai" ||
    requested === "gemini" ||
    requested === "claude"
  ) {
    return requested;
  }

  // Check explicit env setting
  const envProvider = process.env.AI_PROVIDER?.toLowerCase();
  if (envProvider === "gemini") {
    return "gemini";
  }
  if (envProvider === "claude") {
    return "claude";
  }
  if (envProvider === "openai") {
    return "openai";
  }

  // Auto-detect from available API keys
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  if (process.env.GEMINI_API_KEY) {
    return "gemini";
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return "claude";
  }

  // Default
  return "openai";
}

/**
 * Returns list of all providers that have API keys configured.
 */
export function getAvailableProviders(): AIProviderType[] {
  const providers: AIProviderType[] = [];
  if (process.env.OPENAI_API_KEY) {
    providers.push("openai");
  }
  if (process.env.GEMINI_API_KEY) {
    providers.push("gemini");
  }
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push("claude");
  }
  return providers;
}

/**
 * Returns the model name to use for the given provider.
 */
function getModelForProvider(provider: AIProviderType): string {
  if (provider === "gemini") {
    return process.env.GEMINI_MODEL || "gemini-2.0-flash";
  }
  if (provider === "claude") {
    return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  }
  return process.env.OPENAI_MODEL || "gpt-4-turbo-preview";
}

// --- OpenAI implementation ---

function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function openaiCompletion(
  messages: ChatMessage[],
  config: CompletionConfig,
): Promise<string> {
  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: getModelForProvider("openai"),
    messages,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens ?? 4096,
  });
  return completion.choices[0].message.content || "";
}

async function* openaiStream(
  messages: ChatMessage[],
  config: CompletionConfig,
): AsyncGenerator<StreamChunk> {
  const client = getOpenAIClient();
  const stream = await client.chat.completions.create({
    model: getModelForProvider("openai"),
    messages,
    stream: true,
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens ?? 4096,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      yield { content };
    }
  }
}

// --- Gemini implementation ---

function getGeminiClient(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
}

function toGeminiMessages(messages: ChatMessage[]): {
  systemInstruction: string;
  history: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
  lastMessage: string;
} {
  let systemInstruction = "";
  const history: Array<{
    role: "user" | "model";
    parts: Array<{ text: string }>;
  }> = [];
  let lastMessage = "";

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "system") {
      systemInstruction += (systemInstruction ? "\n" : "") + msg.content;
    } else if (i === messages.length - 1 && msg.role === "user") {
      lastMessage = msg.content;
    } else {
      history.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  return { systemInstruction, history, lastMessage };
}

async function geminiCompletion(
  messages: ChatMessage[],
  config: CompletionConfig,
): Promise<string> {
  const client = getGeminiClient();
  const { systemInstruction, history, lastMessage } =
    toGeminiMessages(messages);

  const model = client.getGenerativeModel({
    model: getModelForProvider("gemini"),
    systemInstruction: systemInstruction || undefined,
    generationConfig: {
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxTokens ?? 4096,
    },
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastMessage);
  return result.response.text();
}

async function* geminiStream(
  messages: ChatMessage[],
  config: CompletionConfig,
): AsyncGenerator<StreamChunk> {
  const client = getGeminiClient();
  const { systemInstruction, history, lastMessage } =
    toGeminiMessages(messages);

  const model = client.getGenerativeModel({
    model: getModelForProvider("gemini"),
    systemInstruction: systemInstruction || undefined,
    generationConfig: {
      temperature: config.temperature ?? 0.7,
      maxOutputTokens: config.maxTokens ?? 4096,
    },
  });

  const chat = model.startChat({ history });
  const result: GenerateContentStreamResult =
    await chat.sendMessageStream(lastMessage);

  for await (const chunk of result.stream) {
    const content = chunk.text();
    if (content) {
      yield { content };
    }
  }
}

// --- Claude/Anthropic implementation ---

function getAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function toAnthropicMessages(messages: ChatMessage[]): {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  let system = "";
  const anthropicMessages: Array<{
    role: "user" | "assistant";
    content: string;
  }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system += (system ? "\n" : "") + msg.content;
    } else {
      anthropicMessages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  }

  return { system, messages: anthropicMessages };
}

async function claudeCompletion(
  messages: ChatMessage[],
  config: CompletionConfig,
): Promise<string> {
  const client = getAnthropicClient();
  const { system, messages: anthropicMessages } = toAnthropicMessages(messages);

  const response = await client.messages.create({
    model: getModelForProvider("claude"),
    max_tokens: config.maxTokens ?? 4096,
    system: system || undefined,
    messages: anthropicMessages,
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

async function* claudeStream(
  messages: ChatMessage[],
  config: CompletionConfig,
): AsyncGenerator<StreamChunk> {
  const client = getAnthropicClient();
  const { system, messages: anthropicMessages } = toAnthropicMessages(messages);

  const stream = client.messages.stream({
    model: getModelForProvider("claude"),
    max_tokens: config.maxTokens ?? 4096,
    system: system || undefined,
    messages: anthropicMessages,
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const content = event.delta.text;
      if (content) {
        yield { content };
      }
    }
  }
}

// --- Public API ---

export async function createCompletion(
  provider: AIProviderType,
  messages: ChatMessage[],
  config: CompletionConfig = {},
): Promise<string> {
  if (provider === "gemini") {
    return geminiCompletion(messages, config);
  }
  if (provider === "claude") {
    return claudeCompletion(messages, config);
  }
  return openaiCompletion(messages, config);
}

export async function* createStreamingCompletion(
  provider: AIProviderType,
  messages: ChatMessage[],
  config: CompletionConfig = {},
): AsyncGenerator<StreamChunk> {
  if (provider === "gemini") {
    yield* geminiStream(messages, config);
  } else if (provider === "claude") {
    yield* claudeStream(messages, config);
  } else {
    yield* openaiStream(messages, config);
  }
}
