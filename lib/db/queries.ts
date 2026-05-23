import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { conversations, inferenceLogs, messages } from "./schema";

export async function getConversationsWithStats() {
	const convs = await db
		.select()
		.from(conversations)
		.orderBy(desc(conversations.updatedAt));

	const stats = await Promise.all(
		convs.map(async (c) => {
			const [{ count }] = await db
				.select({ count: sql<number>`cast(count(${messages.id}) as int)` })
				.from(messages)
				.where(eq(messages.conversationId, c.id));

			const [lastMessage] = await db
				.select()
				.from(messages)
				.where(eq(messages.conversationId, c.id))
				.orderBy(desc(messages.createdAt))
				.limit(1);

			return {
				...c,
				messageCount: count,
				lastMessagePreview: lastMessage?.content?.substring(0, 100) || null,
			};
		}),
	);

	return stats;
}

export async function getConversationWithMessages(id: string) {
	const [conv] = await db
		.select()
		.from(conversations)
		.where(eq(conversations.id, id));
	if (!conv) return null;
	const msgs = await db
		.select()
		.from(messages)
		.where(eq(messages.conversationId, id))
		.orderBy(asc(messages.createdAt));
	return { ...conv, messages: msgs };
}

export async function cancelConversation(id: string) {
	const [updated] = await db
		.update(conversations)
		.set({ status: "cancelled", updatedAt: new Date() })
		.where(eq(conversations.id, id))
		.returning();
	return updated;
}

export async function createConversation(
	data: typeof conversations.$inferInsert,
) {
	const [newConversation] = await db
		.insert(conversations)
		.values(data)
		.returning();
	return newConversation;
}

export async function getMessages(conversationId: string) {
	return db
		.select()
		.from(messages)
		.where(eq(messages.conversationId, conversationId))
		.orderBy(asc(messages.createdAt));
}

export async function insertMessage(data: typeof messages.$inferInsert) {
	const [newMessage] = await db.insert(messages).values(data).returning();
	return newMessage;
}

export async function insertInferenceLog(
	data: typeof inferenceLogs.$inferInsert,
) {
	const [newLog] = await db.insert(inferenceLogs).values(data).returning();
	return newLog;
}

export async function updateConversationStatus(
	id: string,
	status: string,
) {
	const [updated] = await db
		.update(conversations)
		.set({ status, updatedAt: new Date() })
		.where(eq(conversations.id, id))
		.returning();
	return updated;
}

export async function updateConversationTitle(
	id: string,
	title: string,
) {
	const [updated] = await db
		.update(conversations)
		.set({ title, updatedAt: new Date() })
		.where(eq(conversations.id, id))
		.returning();
	return updated;
}

export async function updateMessageStatus(
	id: string,
	status: string,
) {
	const [updated] = await db
		.update(messages)
		.set({ status })
		.where(eq(messages.id, id))
		.returning();
	return updated;
}

export async function deleteConversation(id: string) {
	const [deleted] = await db
		.delete(conversations)
		.where(eq(conversations.id, id))
		.returning();
	return deleted;
}
