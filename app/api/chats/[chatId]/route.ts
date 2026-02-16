import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getChatById } from "@/lib/db/queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const session = await auth();
    const { chatId } = await params;

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 },
      );
    }

    const chat = await getChatById({ chatId });

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    if (session?.user?.id && chat.user_id !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      id: chat.id,
      name: chat.name,
      demo: chat.demo_url,
      messages: (chat.messages || []).map((msg, index) => ({
        id: `${chat.id}-msg-${index}`,
        role: msg.role,
        content: msg.content,
      })),
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
    });
  } catch (error) {
    console.error("Error fetching chat details:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch chat details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
