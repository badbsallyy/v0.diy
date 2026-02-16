import "server-only";

import { and, count, desc, eq, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import db from "./connection";
import { type Chat, chat_ownerships, chats, type User, users } from "./schema";
import { generateHashedPassword } from "./utils";

/**
 * Gets the database instance, throwing if not initialized.
 * @throws Error if POSTGRES_URL is not set
 */
function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Ensure POSTGRES_URL is set.");
  }

  return db;
}

/** Retrieves a user by email address. */
export async function getUser(email: string): Promise<User[]> {
  try {
    return await getDb().select().from(users).where(eq(users.email, email));
  } catch (error) {
    console.error("Failed to get user from database");
    throw error;
  }
}

/** Creates a new user with email and password. */
export async function createUser(
  email: string,
  password: string,
): Promise<User[]> {
  try {
    const hashedPassword = generateHashedPassword(password);
    return await getDb()
      .insert(users)
      .values({
        email,
        password: hashedPassword,
      })
      .returning();
  } catch (error) {
    console.error("Failed to create user in database");
    throw error;
  }
}

/** Creates a mapping between a v0 chat ID and a user ID. */
export async function createChatOwnership({
  v0ChatId,
  userId,
}: {
  v0ChatId: string;
  userId: string;
}) {
  try {
    return await getDb()
      .insert(chat_ownerships)
      .values({
        v0_chat_id: v0ChatId,
        user_id: userId,
      })
      .onConflictDoNothing({ target: chat_ownerships.v0_chat_id });
  } catch (error) {
    console.error("Failed to create chat ownership in database");
    throw error;
  }
}

/** Gets the ownership record for a v0 chat ID. */
export async function getChatOwnership({ v0ChatId }: { v0ChatId: string }) {
  try {
    const [ownership] = await getDb()
      .select()
      .from(chat_ownerships)
      .where(eq(chat_ownerships.v0_chat_id, v0ChatId));
    return ownership;
  } catch (error) {
    console.error("Failed to get chat ownership from database");
    throw error;
  }
}

/** Gets all chat IDs owned by a user, sorted by creation date (newest first). */
export async function getChatIdsByUserId({
  userId,
}: {
  userId: string;
}): Promise<string[]> {
  try {
    const ownerships = await getDb()
      .select({ v0ChatId: chat_ownerships.v0_chat_id })
      .from(chat_ownerships)
      .where(eq(chat_ownerships.user_id, userId))
      .orderBy(desc(chat_ownerships.created_at));

    return ownerships.map((o: { v0ChatId: string }) => o.v0ChatId);
  } catch (error) {
    console.error("Failed to get chat IDs by user from database");
    throw error;
  }
}

/** Deletes the ownership record for a v0 chat ID. */
export async function deleteChatOwnership({ v0ChatId }: { v0ChatId: string }) {
  try {
    return await getDb()
      .delete(chat_ownerships)
      .where(eq(chat_ownerships.v0_chat_id, v0ChatId));
  } catch (error) {
    console.error("Failed to delete chat ownership from database");
    throw error;
  }
}

/**
 * Gets the number of chats created by a user in the specified time window.
 * Used for rate limiting authenticated users.
 */
export async function getChatCountByUserId({
  userId,
  differenceInHours,
}: {
  userId: string;
  differenceInHours: number;
}): Promise<number> {
  try {
    const hoursAgo = new Date(Date.now() - differenceInHours * 60 * 60 * 1000);

    const [stats] = await getDb()
      .select({ count: count(chats.id) })
      .from(chats)
      .where(and(eq(chats.user_id, userId), gte(chats.created_at, hoursAgo)));

    return stats?.count || 0;
  } catch (error) {
    console.error("Failed to get chat count by user from database");
    throw error;
  }
}

// ---- New chat CRUD functions for OpenAI integration ----

/** Creates a new chat with an initial user message. */
export async function createChat({
  userId,
  message,
}: {
  userId: string;
  message: string;
}): Promise<string> {
  try {
    const chatId = nanoid();
    const name = message.slice(0, 100);
    await getDb()
      .insert(chats)
      .values({
        id: chatId,
        user_id: userId,
        name,
        messages: [{ role: "user", content: message }],
      });

    // Also create an ownership record for backward compatibility
    await getDb()
      .insert(chat_ownerships)
      .values({
        v0_chat_id: chatId,
        user_id: userId,
      })
      .onConflictDoNothing({ target: chat_ownerships.v0_chat_id });

    return chatId;
  } catch (error) {
    console.error("Failed to create chat in database");
    throw error;
  }
}

/** Gets a chat by its ID. */
export async function getChatById({
  chatId,
}: {
  chatId: string;
}): Promise<Chat | null> {
  try {
    const [chat] = await getDb()
      .select()
      .from(chats)
      .where(eq(chats.id, chatId));
    return chat || null;
  } catch (error) {
    console.error("Failed to get chat from database");
    throw error;
  }
}

/** Gets all chats for a user, sorted by most recent first. */
export async function getChatsByUserId({
  userId,
}: {
  userId: string;
}): Promise<Chat[]> {
  try {
    return await getDb()
      .select()
      .from(chats)
      .where(eq(chats.user_id, userId))
      .orderBy(desc(chats.created_at));
  } catch (error) {
    console.error("Failed to get chats by user from database");
    throw error;
  }
}

/** Adds a message to an existing chat. */
export async function addMessageToChat({
  chatId,
  role,
  content,
}: {
  chatId: string;
  role: string;
  content: string;
}) {
  try {
    const chat = await getChatById({ chatId });
    if (!chat) {
      throw new Error(`Chat ${chatId} not found`);
    }
    const messages = chat.messages || [];
    messages.push({ role, content });

    await getDb()
      .update(chats)
      .set({ messages, updated_at: new Date() })
      .where(eq(chats.id, chatId));
  } catch (error) {
    console.error("Failed to add message to chat in database");
    throw error;
  }
}

/** Deletes a chat by its ID. */
export async function deleteChat({ chatId }: { chatId: string }) {
  try {
    // Also clean up ownership record
    await getDb()
      .delete(chat_ownerships)
      .where(eq(chat_ownerships.v0_chat_id, chatId));
    return await getDb().delete(chats).where(eq(chats.id, chatId));
  } catch (error) {
    console.error("Failed to delete chat from database");
    throw error;
  }
}

/** Updates the visibility of a chat. */
export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: string;
}) {
  try {
    return await getDb()
      .update(chats)
      .set({ visibility, updated_at: new Date() })
      .where(eq(chats.id, chatId));
  } catch (error) {
    console.error("Failed to update chat visibility in database");
    throw error;
  }
}

/** Forks (duplicates) a chat for a user. */
export async function forkChat({
  chatId,
  userId,
}: {
  chatId: string;
  userId: string;
}): Promise<string> {
  try {
    const original = await getChatById({ chatId });
    if (!original) {
      throw new Error(`Chat ${chatId} not found`);
    }

    const newChatId = nanoid();
    await getDb()
      .insert(chats)
      .values({
        id: newChatId,
        user_id: userId,
        name: original.name ? `Fork of ${original.name}` : "Forked Chat",
        messages: original.messages || [],
        visibility: "private",
      });

    await getDb()
      .insert(chat_ownerships)
      .values({
        v0_chat_id: newChatId,
        user_id: userId,
      })
      .onConflictDoNothing({ target: chat_ownerships.v0_chat_id });

    return newChatId;
  } catch (error) {
    console.error("Failed to fork chat in database");
    throw error;
  }
}
