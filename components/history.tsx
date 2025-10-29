"use client";

import cx from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Menu, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import type { Chat } from "@/lib/db/schema";
import { fetcher } from "@/utils/functions";

export const History = () => {
	const { id } = useParams();
	const router = useRouter();

	const [isHistoryVisible, setIsHistoryVisible] = useState(false);
	const {
		data: history,
		error,
		isLoading,
		mutate,
	} = useSWR<Array<Chat>>("/api/history", fetcher, {
		fallbackData: [],
	});

	useEffect(() => {
		mutate();
	}, [mutate]);

	const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		try {
			const response = await fetch("/api/history/delete", {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ id: chatId }),
			});

			if (response.ok) {
				mutate(); // Refresh the history list
			} else {
				console.error("Failed to delete chat");
			}
		} catch (error) {
			console.error("Error deleting chat:", error);
		}
	};

	return (
		<>
			<button
				type="button"
				className="text-muted-foreground cursor-pointer bg-transparent border-none p-0"
				onClick={() => {
					setIsHistoryVisible(true);
				}}
				aria-label="Open chat history"
			>
				<Menu size={16} className="text-current" />
			</button>

			<AnimatePresence>
				{isHistoryVisible && (
					<>
						<motion.div
							className="fixed bg-background/80 backdrop-blur-sm h-dvh w-dvw top-0 left-0 z-20"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => {
								setIsHistoryVisible(false);
							}}
						/>

						<motion.div
							className="fixed top-0 left-0 w-80 h-dvh p-3 flex flex-col gap-6 bg-card z-20"
							initial={{ x: "-100%" }}
							animate={{ x: "0%" }}
							exit={{ x: "-100%" }}
							transition={{ type: "spring", stiffness: 400, damping: 40 }}
						>
							<div className="text-sm flex flex-row items-center justify-between">
								<div className="flex flex-row gap-2">
									<div className="text-foreground">History</div>
									<div className="text-muted-foreground">
										{history === undefined ? "loading" : history.length} chats
									</div>
								</div>

								<button
									type="button"
									className="text-muted-foreground bg-muted hover:bg-accent p-1.5 rounded-md cursor-pointer"
									onClick={() => {
										setIsHistoryVisible(false);
										router.push("/");
										router.refresh();
									}}
								>
									<Plus size={14} className="text-current" />
								</button>
							</div>

							<div className="flex flex-col overflow-y-scroll">
								{error && error.status === 401 ? (
									<div className="text-muted-foreground h-dvh w-full flex flex-row justify-center items-center text-sm gap-2">
										<Info size={16} className="text-current" />
										<div>Login to save and revisit previous chats!</div>
									</div>
								) : null}

								{!isLoading && history?.length === 0 && !error ? (
									<div className="text-muted-foreground h-dvh w-full flex flex-row justify-center items-center text-sm gap-2">
										<Info size={16} className="text-current" />
										<div>No chats found</div>
									</div>
								) : null}

								{isLoading && !error ? (
									<div className="flex flex-col w-full">
										{[44, 32, 28, 52].map((item) => (
											<div key={item} className="p-2 border-b border-border">
												<div
													className={`w-${item} h-[20px] bg-muted animate-pulse`}
												/>
											</div>
										))}
									</div>
								) : null}

								{history?.map((chat) => (
									<div
										key={chat.id}
										className={cx(
											"p-2 text-muted-foreground border-b border-border text-sm hover:bg-accent last-of-type:border-b-0 flex items-center justify-between group",
											{
												"bg-accent": id === chat.id,
											},
										)}
									>
										<Link
											href={`/chat/${chat.id}`}
											className="flex-1 truncate"
											onClick={() => {
												setIsHistoryVisible(false);
											}}
										>
											{chat.messages[0]?.parts
												?.filter((part) => part.type === "text")
												.map((part) => part.text)
												.join(" ") ||
												(chat.messages[0] as { content?: string })?.content}
										</Link>
										<button
											type="button"
											onClick={(e) => handleDeleteChat(chat.id, e)}
											className="ml-2 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 rounded"
											title="Delete chat"
										>
											<Trash2 size={14} className="text-destructive" />
										</button>
									</div>
								))}
							</div>
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</>
	);
};
