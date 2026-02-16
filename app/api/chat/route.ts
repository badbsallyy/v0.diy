import { type NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import {
  type AIProviderType,
  type ChatMessage,
  createCompletion,
  createStreamingCompletion,
  getActiveProvider,
  getAvailableProviders,
} from "@/lib/ai-provider";
import { auth } from "@/app/(auth)/auth";
import {
  addMessageToChat,
  createChat,
  getChatById,
  getChatCountByUserId,
} from "@/lib/db/queries";
import { userEntitlements } from "@/lib/entitlements";
import { ChatSDKError } from "@/lib/errors";

const SYSTEM_PROMPT = `You are an expert React component generator specialized in creating production-ready, modern React components.

Your task: Generate complete, functional React components based on user descriptions.

GUIDELINES:
- Use TypeScript with proper type definitions
- Use Tailwind CSS for all styling
- Use modern React patterns (functional components, hooks)
- Follow accessibility best practices (semantic HTML, ARIA labels)
- Make components responsive (mobile-first approach)
- Include helpful inline comments
- Use shadcn/ui components when appropriate
- Ensure proper prop typing with TypeScript interfaces

OUTPUT FORMAT:
- Provide complete, copy-paste ready code
- Export component as default
- Include all necessary imports
- Structure code cleanly with proper spacing
- Add brief usage examples in comments when helpful

STYLE PREFERENCES:
- Clean, minimal design
- Modern UI/UX patterns
- Consistent spacing and typography
- Dark mode support when applicable`;

const STREAMING_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

async function checkRateLimit(
  session: Session | null,
): Promise<Response | null> {
  // Require authentication
  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chatCount = await getChatCountByUserId({
    userId: session.user.id,
    differenceInHours: 24,
  });

  if (chatCount >= userEntitlements.maxMessagesPerDay) {
    return new ChatSDKError("rate_limit:chat").toResponse();
  }

  return null;
}

function createStreamingResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { headers: STREAMING_HEADERS });
}

async function handleStreaming(
  provider: AIProviderType,
  messages: ChatMessage[],
  activeChatId: string,
): Promise<Response> {
  const stream = createStreamingCompletion(provider, messages);

  let fullResponse = "";
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        const chatMeta = JSON.stringify({
          type: "chat_metadata",
          id: activeChatId,
          object: "chat",
        });
        controller.enqueue(encoder.encode(`data: ${chatMeta}\n\n`));

        for await (const chunk of stream) {
          if (chunk.content) {
            fullResponse += chunk.content;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "content", content: chunk.content })}\n\n`,
              ),
            );
          }
        }

        if (activeChatId) {
          await addMessageToChat({
            chatId: activeChatId,
            role: "assistant",
            content: fullResponse,
          });
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`),
        );
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return createStreamingResponse(readableStream);
}

async function handleNonStreaming(
  provider: AIProviderType,
  messages: ChatMessage[],
  userMessage: string,
  activeChatId: string,
): Promise<Response> {
  const assistantContent = await createCompletion(provider, messages);

  if (activeChatId) {
    await addMessageToChat({
      chatId: activeChatId,
      role: "assistant",
      content: assistantContent,
    });
  }

  return NextResponse.json({
    id: activeChatId,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantContent },
    ],
  });
}

export async function POST(request: NextRequest) {
  let providerName = "unknown";
  try {
    const session = await auth();
    const { message, chatId, streaming, provider: requestedProvider } =
      await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    const rateLimitResponse = await checkRateLimit(session);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Resolve provider (per-request override or default)
    const provider = getActiveProvider(requestedProvider);
    providerName = provider;

    // Verify the chosen provider has an API key configured
    const available = getAvailableProviders();
    if (!available.includes(provider)) {
      return NextResponse.json(
        {
          error: `Provider "${provider}" is not configured. Set the corresponding API key in your environment variables.`,
        },
        { status: 400 },
      );
    }

    // userId is guaranteed non-null by checkRateLimit above
    const userId = session?.user?.id || "";

    // Build messages array for the AI provider
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    let activeChatId = chatId;

    if (chatId) {
      // Load existing chat history
      const existingChat = await getChatById({ chatId });
      if (existingChat?.messages) {
        for (const msg of existingChat.messages) {
          messages.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        }
      }
      // Add the new user message to the DB
      await addMessageToChat({ chatId, role: "user", content: message });
    } else {
      // Create a new chat
      activeChatId = await createChat({ userId, message });
    }

    // Add the current user message
    messages.push({ role: "user", content: message });

    if (streaming) {
      return handleStreaming(provider, messages, activeChatId);
    }

    return handleNonStreaming(provider, messages, message, activeChatId);
  } catch (error) {
    console.error(`AI Provider Error (${providerName}):`, error);
    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
