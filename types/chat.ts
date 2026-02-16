/**
 * Type for message content - plain string for OpenAI responses.
 * Kept as a union type for backward compatibility with existing rendering code.
 */
export type MessageBinaryFormat = [number, ...unknown[]][];

/**
 * General message content type supporting both string and structured formats.
 */
export type MessageContent = string | MessageBinaryFormat;

/**
 * Task part types for structured task content in shared-components
 */
export interface TaskPartChangedFile {
  fileName?: string;
  baseName?: string;
}

export interface TaskPartInspiration {
  title?: string;
  description?: string;
}

export interface TaskPart {
  type: string;
  query?: string;
  filePaths?: string[];
  filePath?: string;
  count?: number;
  answer?: string;
  changedFiles?: TaskPartChangedFile[];
  inspirations?: TaskPartInspiration[];
  requirements?: unknown[];
  status?: string;
  message?: string;
  description?: string;
  text?: string;
  error?: string;
  source?: string;
}

/**
 * Chat-related types for use-chat hook
 */
export interface Chat {
  id: string;
  demo?: string;
  url?: string;
  messages?: ChatMessageData[];
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  experimental_content?: MessageBinaryFormat;
}

export interface ChatMessage {
  type: "user" | "assistant";
  content: string | MessageBinaryFormat;
  isStreaming?: boolean;
  stream?: ReadableStream<Uint8Array> | null;
}

export interface ChatData {
  id?: string;
  webUrl?: string;
  url?: string;
  object?: string;
}

/**
 * Image attachment types for prompt input
 */
export interface ImageAttachment {
  id: string;
  file: File;
  preview: string;
  dataUrl?: string;
}

export interface StoredImageAttachment {
  id: string;
  fileName: string;
  dataUrl: string;
  preview: string;
}

export interface StoredPromptData {
  message: string;
  attachments: StoredImageAttachment[];
}
