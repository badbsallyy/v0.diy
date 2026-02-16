import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getChatById, updateChatVisibility } from "@/lib/db/queries";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const session = await auth();
    const { chatId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 },
      );
    }

    const chat = await getChatById({ chatId });
    if (!chat || chat.user_id !== session.user.id) {
      return NextResponse.json(
        { error: "Chat not found or access denied" },
        { status: 404 },
      );
    }

    const { privacy } = await request.json();

    if (
      !(
        privacy &&
        ["public", "private", "team", "team-edit", "unlisted"].includes(privacy)
      )
    ) {
      return NextResponse.json(
        { error: "Invalid privacy setting" },
        { status: 400 },
      );
    }

    await updateChatVisibility({ chatId, visibility: privacy });

    return NextResponse.json({ id: chatId, visibility: privacy });
  } catch (error) {
    console.error("Change Chat Visibility Error:", error);

    return NextResponse.json(
      {
        error: "Failed to change chat visibility",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
