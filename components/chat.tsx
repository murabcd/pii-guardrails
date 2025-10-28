"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { motion } from "framer-motion";
import type { Session } from "next-auth";
import { useEffect, useState } from "react";
import { Files } from "@/components/files";
import { File } from "lucide-react";
import { Message as PreviewMessage } from "@/components/message";
import { SettingsModal } from "@/components/settings";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";

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
	const [similarityThreshold, setSimilarityThreshold] = useState(1.0);

	useEffect(() => {
		if (isMounted !== false && session && session.user) {
			localStorage.setItem(
				`${session.user.email}/selected-file-pathnames`,
				JSON.stringify(selectedFilePathnames),
			);
			localStorage.setItem(
				`${session.user.email}/similarity-threshold`,
				similarityThreshold.toString(),
			);
		}
	}, [selectedFilePathnames, similarityThreshold, isMounted, session]);

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
			const savedThreshold = localStorage.getItem(
				`${session.user.email}/similarity-threshold`,
			);
			if (savedThreshold) {
				setSimilarityThreshold(parseFloat(savedThreshold));
			}
		}
	}, [session]);

	const [input, setInput] = useState("");

	const { messages, sendMessage } = useChat({
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

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (input.trim() !== "") {
			sendMessage(
				{ text: input },
				{
					body: {
						selectedFilePathnames,
						similarityThreshold,
					},
				},
			);
			setInput("");
		}
	};

	return (
		<div className="flex flex-row justify-center pb-20 h-dvh bg-background">
			<div className="flex flex-col justify-between items-center gap-4">
				<div
					ref={messagesContainerRef}
					className="flex flex-col gap-4 h-full w-dvw items-center overflow-y-scroll"
				>
					{messages.map((message, index) => (
						<PreviewMessage
							key={`${id}-${index}`}
							role={message.role}
							content={
								message.parts
									?.filter((part) => part.type === "text")
									.map((part) => part.text)
									.join("") || ""
							}
						/>
					))}
					<div
						ref={messagesEndRef}
						className="shrink-0 min-w-[24px] min-h-[24px]"
					/>
				</div>

				{messages.length === 0 && (
					<div className="grid sm:grid-cols-2 gap-2 w-full px-4 md:px-0 mx-auto md:max-w-[500px]">
						{suggestedActions.map((suggestedAction, index) => (
							<motion.div
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.05 * index }}
								key={index}
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
				)}

				<form
					className="flex flex-row gap-2 relative items-center w-full md:max-w-[500px] max-w-[calc(100dvw-32px) px-4 md:px-0"
					onSubmit={handleSubmit}
				>
					<input
						className="bg-muted rounded-md px-2 py-1.5 flex-1 outline-none text-foreground"
						placeholder="Send a message..."
						value={input}
						onChange={(event) => {
							setInput(event.target.value);
						}}
					/>

					<button
						type="button"
						className="relative text-sm bg-muted rounded-lg size-9 shrink-0 flex flex-row items-center justify-center cursor-pointer hover:bg-accent"
						onClick={() => {
							setIsFilesVisible(!isFilesVisible);
						}}
					>
						<File size={16} className="text-current" />
						<motion.div
							className="absolute text-xs -top-2 -right-2 bg-primary size-5 rounded-full flex flex-row justify-center items-center border-2 border-background text-primary-foreground"
							initial={{ opacity: 0, scale: 0.5 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ delay: 0.5 }}
						>
							{selectedFilePathnames?.length}
						</motion.div>
					</button>

					<SettingsModal
						similarityThreshold={similarityThreshold}
						onThresholdChange={setSimilarityThreshold}
					/>
				</form>
			</div>

			<Files
				isOpen={isFilesVisible}
				onOpenChange={setIsFilesVisible}
				selectedFilePathnames={selectedFilePathnames}
				setSelectedFilePathnames={setSelectedFilePathnames}
			/>
		</div>
	);
}
