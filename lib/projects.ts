import "server-only";

import { getChatsByUserId } from "@/lib/db/queries";

export interface Project {
  id: string;
  name: string;
  demoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export async function getProjectsByUserId(userId: string): Promise<Project[]> {
  const userChats = await getChatsByUserId({ userId });

  return userChats.map((chat) => ({
    id: chat.id,
    name:
      chat.name ||
      chat.messages?.[0]?.content?.slice(0, 50) ||
      "Untitled Project",
    demoUrl: chat.demo_url || null,
    createdAt: chat.created_at.toISOString(),
    updatedAt: chat.updated_at.toISOString(),
    messageCount: chat.messages?.length || 0,
  }));
}
