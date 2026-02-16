import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getChatsByUserId } from "@/lib/db/queries";

export async function GET(_request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ data: [] });
    }

    const userChats = await getChatsByUserId({ userId: session.user.id });

    const data = userChats.map((chat) => ({
      id: chat.id,
      name: chat.name,
      demo: chat.demo_url,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      messages: chat.messages || [],
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Chats fetch error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch chats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
