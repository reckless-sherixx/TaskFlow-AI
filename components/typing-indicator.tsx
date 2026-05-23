"use client";

import { type FC } from "react";

type TypingIndicatorProps = {
	label?: string;
};

export const TypingIndicator: FC<TypingIndicatorProps> = ({
	label = "AI is thinking...",
}) => {
	return (
		<div
			data-slot="aui_typing-indicator"
			className="typing-indicator-root flex items-center gap-3 px-2 py-3"
		>
			<div className="typing-dots flex items-center gap-1.5">
				<span
					className="typing-dot size-2 rounded-full bg-muted-foreground/60"
					style={{ animation: "typing-bounce 1.4s infinite ease-in-out", animationDelay: "0ms" }}
				/>
				<span
					className="typing-dot size-2 rounded-full bg-muted-foreground/60"
					style={{ animation: "typing-bounce 1.4s infinite ease-in-out", animationDelay: "200ms" }}
				/>
				<span
					className="typing-dot size-2 rounded-full bg-muted-foreground/60"
					style={{ animation: "typing-bounce 1.4s infinite ease-in-out", animationDelay: "400ms" }}
				/>
			</div>
			<span className="typing-label text-xs text-muted-foreground/80 select-none">
				{label}
			</span>

			<style>{`
				@keyframes typing-bounce {
					0%, 60%, 100% {
						transform: translateY(0);
						opacity: 0.4;
					}
					30% {
						transform: translateY(-6px);
						opacity: 1;
					}
				}
			`}</style>
		</div>
	);
};
