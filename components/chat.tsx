"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { motion } from "framer-motion";
import { ArrowUp, Paperclip } from "lucide-react";
import type { Session } from "next-auth";
import { useEffect, useState, useRef } from "react";
import { Files } from "@/components/files";
import { Message as PreviewMessage, ThinkingMessage } from "@/components/message";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";
import { useSettings } from "@/components/settings-provider";
import { Textarea } from "@/components/ui/textarea";
import { SidebarToggle } from "@/components/sidebar-toggle";

const suggestedActions = [
	{
		title: "What's the summary",
		label: "of these documents?",
		action: "what's the summary of these documents?",
	},
	{
		title: "Who is the author",
		label: "of these documents?",
		action: "who is the author of these documents?",
	},
];

export function Chat({
	id,
	initialMessages,
	session,
}: {
	id: string;
	initialMessages: Array<UIMessage>;
	session: Session | null;
}) {
	const [selectedFilePathnames, setSelectedFilePathnames] = useState<
		Array<string>
	>([]);
	const [isFilesVisible, setIsFilesVisible] = useState(false);
	const [isMounted, setIsMounted] = useState(false);
	const { similarityThreshold, enabledEntities } = useSettings();

	useEffect(() => {
		if (isMounted !== false && session && session.user) {
			localStorage.setItem(
				`${session.user.email}/selected-file-pathnames`,
				JSON.stringify(selectedFilePathnames),
			);
		}
	}, [selectedFilePathnames, isMounted, session]);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	useEffect(() => {
		if (session?.user) {
			setSelectedFilePathnames(
				JSON.parse(
					localStorage.getItem(
						`${session.user.email}/selected-file-pathnames`,
					) || "[]",
				),
			);
		}
	}, [session]);

	const [input, setInput] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const { messages, sendMessage, status, stop } = useChat({
		id,
		transport: new DefaultChatTransport({
			api: "/api/chat",
			body: { id },
		}),
		messages: initialMessages,
		onFinish: () => {
			window.history.replaceState({}, "", `/chat/${id}`);
		},
	});

	const [messagesContainerRef, messagesEndRef] =
		useScrollToBottom<HTMLDivElement>();

	const isLoading = status === "streaming" || status === "submitted";

	useEffect(() => {
		if (messages.length > 0 && messagesEndRef.current) {
			messagesEndRef.current.scrollIntoView({
				behavior: "smooth",
				block: "end",
			});
		}
	}, [messages.length, messagesEndRef]);

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (input.trim() !== "" && !isLoading) {
			sendMessage(
				{ text: input },
				{
					body: {
						selectedFilePathnames,
						similarityThreshold,
						guardrailEnabledEntities: enabledEntities,
					},
				},
			);
			setInput("");
			// Trigger scroll after sending
			setTimeout(() => {
				if (messagesEndRef.current) {
					messagesEndRef.current.scrollIntoView({
						behavior: "smooth",
						block: "end",
					});
				}
			}, 100);
		}
	};

	return (
		<div className="relative flex flex-col h-full bg-background">
			<header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2 z-10">
				<SidebarToggle />
			</header>
			<div
				ref={messagesContainerRef}
				className={`flex flex-col gap-4 flex-1 w-full overflow-y-auto py-8 ${
					messages.length === 0 ? "justify-center items-center" : ""
				}`}
			>
				<div className="pt-8 mx-auto max-w-2xl w-full">
					{messages.map((message) => (
					<PreviewMessage
						key={
							message.id ||
							`${id}-${message.role}-${
								message.parts
									?.filter((part) => part.type === "text")
									.map((part) => part.text)
									.join("") || ""
							}`
						}
						role={message.role}
						content={
							message.parts
								?.filter((part) => part.type === "text")
								.map((part) => part.text)
								.join("") || ""
						}
					/>
					))}
					{status === "submitted" && <ThinkingMessage key="thinking" />}
					<div
						ref={messagesEndRef}
						className="shrink-0 min-w-[24px] min-h-[24px]"
					/>
				</div>
			</div>

			{messages.length === 0 ? (
				<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-4 w-full md:max-w-[500px] max-w-[calc(100dvw-32px)] px-4 md:px-0 mx-auto">
					<div className="grid sm:grid-cols-2 gap-2 w-full">
						{suggestedActions.map((suggestedAction, index) => (
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.05 * index }}
								key={suggestedAction.action}
								className={index > 1 ? "hidden sm:block" : "block"}
							>
								<button
									type="button"
									onClick={async () => {
										sendMessage(
											{ text: suggestedAction.action },
											{
												body: {
													selectedFilePathnames,
													similarityThreshold,
													guardrailEnabledEntities: enabledEntities,
												},
											},
										);
									}}
									className="w-full text-left border border-border text-foreground rounded-lg p-2 text-sm hover:bg-accent transition-colors flex flex-col"
								>
									<span className="font-medium">{suggestedAction.title}</span>
									<span className="text-muted-foreground">
										{suggestedAction.label}
									</span>
								</button>
							</motion.div>
						))}
					</div>
					<div className="flex flex-col gap-3 w-full">
					<form className="relative w-full" onSubmit={handleSubmit}>
						<div className="relative">
							<Textarea
								ref={textareaRef}
								className="resize-none bg-secondary w-full rounded-2xl pl-12 pr-12 pt-4 pb-16"
								value={input}
								autoFocus
								placeholder="Say something..."
								onChange={(e) => {
									setInput(e.target.value);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										if (input.trim() && !isLoading) {
											const form = e.currentTarget.closest("form");
											if (form) {
												form.requestSubmit();
											}
										}
									}
								}}
							/>
							<button
								type="button"
								className="absolute left-2 bottom-2 rounded-full p-2 bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
								onClick={() => {
									setIsFilesVisible(!isFilesVisible);
								}}
							>
								<Paperclip size={16} className="text-current" />
								{selectedFilePathnames?.length > 0 && (
									<motion.div
										className="absolute text-xs -top-2 -right-2 bg-primary size-5 rounded-full flex flex-row justify-center items-center border-2 border-background text-primary-foreground"
										initial={{ opacity: 0, scale: 0.5 }}
										animate={{ opacity: 1, scale: 1 }}
										transition={{ delay: 0.5 }}
									>
										{selectedFilePathnames.length}
									</motion.div>
								)}
							</button>
							{isLoading ? (
								<button
									type="button"
									onClick={stop}
									className="cursor-pointer absolute right-2 bottom-2 rounded-full p-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
								>
									<div className="animate-spin h-4 w-4">
										<svg
											className="h-4 w-4 text-current"
											viewBox="0 0 24 24"
											aria-label="Stop"
										>
											<title>Stop</title>
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												strokeWidth="4"
												fill="none"
											/>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											/>
										</svg>
									</div>
								</button>
							) : (
								<button
									type="submit"
									disabled={isLoading || !input.trim()}
									className="absolute right-2 bottom-2 rounded-full p-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
								>
									<ArrowUp className="h-4 w-4 text-current" />
								</button>
							)}
						</div>
					</form>
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-3 w-full md:max-w-[500px] max-w-[calc(100dvw-32px)] px-4 md:px-0 mx-auto sticky bottom-0 pb-4 bg-background">
					<form className="relative w-full" onSubmit={handleSubmit}>
						<div className="relative">
							<Textarea
								ref={textareaRef}
								className="resize-none bg-secondary w-full rounded-2xl pl-12 pr-12 pt-4 pb-16"
								value={input}
								autoFocus
								placeholder="Say something..."
								onChange={(e) => {
									setInput(e.target.value);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										if (input.trim() && !isLoading) {
											const form = e.currentTarget.closest("form");
											if (form) {
												form.requestSubmit();
											}
										}
									}
								}}
							/>
							<button
								type="button"
								className="absolute left-2 bottom-2 rounded-full p-2 bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
								onClick={() => {
									setIsFilesVisible(!isFilesVisible);
								}}
							>
								<Paperclip size={16} className="text-current" />
								{selectedFilePathnames?.length > 0 && (
									<motion.div
										className="absolute text-xs -top-2 -right-2 bg-primary size-5 rounded-full flex flex-row justify-center items-center border-2 border-background text-primary-foreground"
										initial={{ opacity: 0, scale: 0.5 }}
										animate={{ opacity: 1, scale: 1 }}
										transition={{ delay: 0.5 }}
									>
										{selectedFilePathnames.length}
									</motion.div>
								)}
							</button>
							{isLoading ? (
								<button
									type="button"
									onClick={stop}
									className="cursor-pointer absolute right-2 bottom-2 rounded-full p-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
								>
									<div className="animate-spin h-4 w-4">
										<svg
											className="h-4 w-4 text-current"
											viewBox="0 0 24 24"
											aria-label="Stop"
										>
											<title>Stop</title>
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												strokeWidth="4"
												fill="none"
											/>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
											/>
										</svg>
									</div>
								</button>
							) : (
								<button
									type="submit"
									disabled={isLoading || !input.trim()}
									className="absolute right-2 bottom-2 rounded-full p-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
								>
									<ArrowUp className="h-4 w-4 text-current" />
								</button>
							)}
						</div>
					</form>
				</div>
			)}

			<Files
				isOpen={isFilesVisible}
				onOpenChange={setIsFilesVisible}
				selectedFilePathnames={selectedFilePathnames}
				setSelectedFilePathnames={setSelectedFilePathnames}
			/>
		</div>
	);
}
