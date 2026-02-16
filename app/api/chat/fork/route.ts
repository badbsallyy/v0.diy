import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { forkChat } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const { chatId } = await request.json();

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 },
      );
    }

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const newChatId = await forkChat({ chatId, userId: session.user.id });

    return NextResponse.json({ id: newChatId });
  } catch (error) {
    console.error("Error forking chat:", error);
    return NextResponse.json({ error: "Failed to fork chat" }, { status: 500 });
  }
}
