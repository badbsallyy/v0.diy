import { useEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import { Message } from "@/components/ai-elements/message";
import { MessageRenderer } from "@/components/message-renderer";
import type { MessageBinaryFormat } from "@/types/chat";

interface SSECallbacks {
  onChatData: (chatData: { id: string }) => void;
  onContent: (content: string) => void;
}

/** Parse a single SSE line and invoke the appropriate callback. */
function handleSSELine(line: string, callbacks: SSECallbacks): void {
  if (!line.startsWith("data: ")) {
    return;
  }
  const jsonStr = line.slice(6).trim();
  if (!jsonStr) {
    return;
  }

  try {
    const data = JSON.parse(jsonStr);
    if (data.type === "chat_metadata" && data.id) {
      callbacks.onChatData({ id: data.id });
    } else if (data.type === "content" && data.content) {
      callbacks.onContent(data.content);
    }
  } catch {
    // Skip unparseable lines
  }
}

/** Read an SSE stream to completion, invoking callbacks for each event. */
async function consumeSSEStream(
  stream: ReadableStream<Uint8Array>,
  callbacks: SSECallbacks,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";

  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      const text = decoder.decode(result.value, { stream: true });
      for (const line of text.split("\n")) {
        handleSSELine(line, {
          onChatData: callbacks.onChatData,
          onContent: (content) => {
            accumulated += content;
            callbacks.onContent(accumulated);
          },
        });
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated;
}

interface ChatMessage {
  type: "user" | "assistant";
  content: string | MessageBinaryFormat;
  isStreaming?: boolean;
  stream?: ReadableStream<Uint8Array> | null;
}

interface Chat {
  id: string;
  demo?: string;
  url?: string;
}

interface ChatMessagesProps {
  chatHistory: ChatMessage[];
  isLoading: boolean;
  currentChat: Chat | null;
  onStreamingComplete: (finalContent: string | MessageBinaryFormat) => void;
  onChatData: (chatData: { id: string; demo?: string; url?: string }) => void;
  onStreamingStarted?: () => void;
}

/** Reads an SSE text stream from the OpenAI backend and renders content progressively. */
function TextStreamingMessage({
  stream,
  messageId,
  onComplete,
  onChatData,
  onChunk,
  onError,
}: {
  stream: ReadableStream<Uint8Array>;
  messageId: string;
  onComplete: (finalContent: string | MessageBinaryFormat) => void;
  onChatData: (chatData: { id: string; demo?: string; url?: string }) => void;
  onChunk?: (chunk: string) => void;
  onError?: (error: Error) => void;
}) {
  const [content, setContent] = useState("");
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    if (hasCompletedRef.current) {
      return;
    }

    consumeSSEStream(stream, {
      onChatData,
      onContent: (accumulated) => {
        setContent(accumulated);
        onChunk?.(accumulated);
      },
    })
      .then((finalContent) => {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onComplete(finalContent);
        }
      })
      .catch((error) => {
        onError?.(error instanceof Error ? error : new Error(String(error)));
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onComplete("");
        }
      });
  }, [stream, onComplete, onChatData, onChunk, onError]);

  return (
    <div id={messageId}>
      <p className="mb-4 whitespace-pre-wrap text-gray-700 leading-relaxed dark:text-gray-200">
        {content || "…"}
      </p>
    </div>
  );
}

export function ChatMessages({
  chatHistory,
  isLoading,
  onStreamingComplete,
  onChatData,
  onStreamingStarted,
}: Omit<ChatMessagesProps, "currentChat">) {
  const streamingStartedRef = useRef(false);

  // Reset the streaming started flag when a new message starts loading
  useEffect(() => {
    if (isLoading) {
      streamingStartedRef.current = false;
    }
  }, [isLoading]);

  if (chatHistory.length === 0) {
    return (
      <Conversation>
        <ConversationContent>
          <div>
            {/* Empty conversation - messages will appear here when they load */}
          </div>
        </ConversationContent>
      </Conversation>
    );
  }

  return (
    <Conversation>
      <ConversationContent>
        {chatHistory.map((msg, index) => (
          <Message from={msg.type} key={`message-${index}-${msg.type}`}>
            {msg.isStreaming && msg.stream ? (
              <TextStreamingMessage
                stream={msg.stream}
                messageId={`msg-${index}`}
                onComplete={onStreamingComplete}
                onChatData={onChatData}
                onChunk={(_chunk) => {
                  // Hide external loader once we start receiving content (only once)
                  if (onStreamingStarted && !streamingStartedRef.current) {
                    streamingStartedRef.current = true;
                    onStreamingStarted();
                  }
                }}
                onError={(error) => console.error("Streaming error:", error)}
              />
            ) : (
              <MessageRenderer
                content={msg.content}
                role={msg.type}
                messageId={`msg-${index}`}
              />
            )}
          </Message>
        ))}
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader size={16} className="text-gray-500 dark:text-gray-400" />
          </div>
        )}
      </ConversationContent>
    </Conversation>
  );
}
