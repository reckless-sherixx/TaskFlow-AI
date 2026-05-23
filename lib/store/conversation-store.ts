"use client";

import { create } from "zustand";


export type ConversationMeta = {
	id: string;
	title: string;
	model: string;
	status: string;
	createdAt: string;
	updatedAt: string;
	lastMessagePreview: string | null;
	messageCount: number;
};

type ConversationStore = {
	conversations: ConversationMeta[];
	activeId: string | null;
	hydrated: boolean;
	setConversations: (convs: ConversationMeta[]) => void;
	upsertConversation: (conv: ConversationMeta) => void;
	setActive: (id: string | null) => void;
	updateTitle: (id: string, title: string) => void;
	updatePreview: (id: string, preview: string) => void;
	markHydrated: () => void;
};

export const useConversationStore = create<ConversationStore>((set) => ({
	conversations: [],
	activeId: null,
	hydrated: false,

	setConversations: (convs) =>
		set({ conversations: convs, hydrated: true }),

	upsertConversation: (conv) =>
		set((state) => {
			const exists = state.conversations.findIndex((c) => c.id === conv.id);
			if (exists >= 0) {
				const updated = [...state.conversations];
				updated[exists] = conv;
				return { conversations: updated };
			}

			return { conversations: [conv, ...state.conversations] };
		}),

	setActive: (id) => set({ activeId: id }),

	updateTitle: (id, title) =>
		set((state) => ({
			conversations: state.conversations.map((c) =>
				c.id === id ? { ...c, title } : c,
			),
		})),

	updatePreview: (id, preview) =>
		set((state) => ({
			conversations: state.conversations.map((c) =>
				c.id === id
					? { ...c, lastMessagePreview: preview.substring(0, 100), updatedAt: new Date().toISOString() }
					: c,
			),
		})),

	markHydrated: () => set({ hydrated: true }),
}));
