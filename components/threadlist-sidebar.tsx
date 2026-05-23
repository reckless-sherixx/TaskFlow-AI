"use client";

import { MessagesSquare, Moon, PlusIcon, Sun, Zap, Trash2 } from "lucide-react";
import type * as React from "react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import type { GeminiModelId, TokenStats } from "@/app/assistant";
import { getModelsByProvider } from "@/lib/ai/models";
import { useConversationStore, type ConversationMeta } from "@/lib/store/conversation-store";

type Props = React.ComponentProps<typeof Sidebar> & {
	tokenStats: TokenStats;
	selectedModel: GeminiModelId;
	onModelChange: (m: GeminiModelId) => void;
	isDark: boolean;
	onToggleDark: () => void;
	onNewThread: () => void;
	onSwitchConversation: (id: string) => void;
};

type ConversationGroup = {
	label: string;
	conversations: ConversationMeta[];
};

function groupConversationsByDate(conversations: ConversationMeta[]): ConversationGroup[] {
	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterdayStart = new Date(todayStart);
	yesterdayStart.setDate(yesterdayStart.getDate() - 1);
	const weekStart = new Date(todayStart);
	weekStart.setDate(weekStart.getDate() - 7);
	const monthStart = new Date(todayStart);
	monthStart.setDate(monthStart.getDate() - 30);

	const groups: Record<string, ConversationMeta[]> = {
		Today: [],
		Yesterday: [],
		"Previous 7 Days": [],
		"Previous 30 Days": [],
		Older: [],
	};

	for (const conv of conversations) {
		const date = new Date(conv.updatedAt || conv.createdAt);
		if (date >= todayStart) {
			groups.Today.push(conv);
		} else if (date >= yesterdayStart) {
			groups.Yesterday.push(conv);
		} else if (date >= weekStart) {
			groups["Previous 7 Days"].push(conv);
		} else if (date >= monthStart) {
			groups["Previous 30 Days"].push(conv);
		} else {
			groups.Older.push(conv);
		}
	}

	return Object.entries(groups)
		.filter(([, convs]) => convs.length > 0)
		.map(([label, convs]) => ({ label, conversations: convs }));
}

export function ThreadListSidebar({
	tokenStats,
	selectedModel,
	onModelChange,
	isDark,
	onToggleDark,
	onNewThread,
	onSwitchConversation,
	...props
}: Props) {
	const { conversations, activeId, removeConversation } = useConversationStore();

	const handleDelete = async (e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		removeConversation(id);
		if (activeId === id) {
			onNewThread();
		}
		try {
			await fetch(`/api/conversations/${id}`, { method: "DELETE" });
		} catch (error) {
			console.error("Failed to delete conversation", error);
		}
	};

	const groups = groupConversationsByDate(conversations);

	const pct = Math.min((tokenStats.used / tokenStats.total) * 100, 100);
	const tokensLeft = Math.max(tokenStats.total - tokenStats.used, 0);

	const barColor =
		pct > 80
			? "bg-red-500"
			: pct > 50
				? "bg-amber-500"
				: "bg-emerald-500";

	return (
		<Sidebar {...props}>
			<SidebarHeader className="aui-sidebar-header mb-2 border-b">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<div className="flex w-full items-center gap-3">
								<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
									<MessagesSquare className="size-4" />
								</div>
								<span className="font-semibold">TaskFlow AI</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<div className="px-3 pb-2">
				<Button
					variant="outline"
					onClick={onNewThread}
					className="h-9 w-full justify-start gap-2 rounded-lg px-3 text-sm"
				>
					<PlusIcon className="size-4" />
					New Thread
				</Button>
			</div>

			<div className="aui-sidebar-content px-2 overflow-y-auto flex-1 min-h-0 flex flex-col gap-2">
				{conversations.length === 0 ? (
					<p className="px-3 py-4 text-xs text-muted-foreground text-center">
						No conversations yet
					</p>
				) : null}

				{groups.map((group) => (
					<div key={group.label} className="mb-3">
						<p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
							{group.label}
						</p>
						<div className="flex flex-col gap-0.5">
							{group.conversations.map((conv) => (
								<button
									key={conv.id}
									type="button"
									onClick={() => onSwitchConversation(conv.id)}
									className={`group/item flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
										activeId === conv.id
											? "bg-muted font-medium"
											: ""
									}`}
								>
									<span className="truncate text-foreground overflow-hidden whitespace-nowrap">
										{conv.title || "New Conversation"}
									</span>
									<div
										role="button"
										tabIndex={0}
										onClick={(e) => handleDelete(e, conv.id)}
										onKeyDown={(e) => e.key === 'Enter' && handleDelete(e as any, conv.id)}
										className="opacity-0 group-hover/item:opacity-100 p-1 hover:bg-background rounded transition-opacity"
									>
										<Trash2 className="size-3.5 text-muted-foreground hover:text-red-500" />
									</div>
								</button>
							))}
						</div>
					</div>
				))}
			</div>

			<SidebarRail />

			<SidebarFooter className="border-t px-3 py-3 space-y-3">
				<div className="space-y-1.5">
					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<span className="flex items-center gap-1 font-medium">
							<Zap className="size-3" />
							Tokens
						</span>
						<span>
							<span className="font-semibold text-foreground">
								{tokensLeft.toLocaleString()}
							</span>
							{" / "}
							{tokenStats.total.toLocaleString()} left
						</span>
					</div>
					<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
						<div
							className={`h-full rounded-full transition-all duration-500 ${barColor}`}
							style={{ width: `${pct}%` }}
						/>
					</div>
				</div>

				<div className="space-y-1">
					<p className="text-xs font-medium text-muted-foreground">
						Model for new chats
					</p>
					<select
						value={selectedModel}
						onChange={(e) => onModelChange(e.target.value as GeminiModelId)}
						className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
					>
						{Object.entries(getModelsByProvider()).map(([provider, models]) => (
							<optgroup key={provider} label={provider}>
								{models.map((m) => (
									<option key={m.id} value={m.id}>
										{m.label}
									</option>
								))}
							</optgroup>
						))}
					</select>
				</div>

				<button
					type="button"
					onClick={onToggleDark}
					className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
				>
					<span>{isDark ? "Dark mode" : "Light mode"}</span>
					{isDark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
				</button>
			</SidebarFooter>
		</Sidebar>
	);
}
