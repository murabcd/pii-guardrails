"use client";

import { AnimatePresence, motion } from "framer-motion";
import { SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { Shimmer } from "./shimmer";

export const Message = ({
	role,
	content,
}: {
	role: string;
	content: string | ReactNode;
}) => {
	return (
		<AnimatePresence key={role}>
			<motion.div
				className="px-4 w-full group/message"
				initial={{ y: 5, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				data-role={role}
			>
				<div
					className={cn(
						"flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl",
						"group-data-[role=user]/message:w-fit",
					)}
				>
					{role === "assistant" && (
						<div className="flex justify-center items-center rounded-full ring-1 size-8 shrink-0 ring-border bg-background">
							<div className="">
								<SparklesIcon size={14} />
							</div>
						</div>
					)}

					<div className="flex flex-col space-y-4 w-full">
						<motion.div
							initial={{ y: 5, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							className="flex flex-row gap-2 items-start pb-4 w-full"
						>
							<div
								className={cn("flex flex-col gap-4", {
									"bg-secondary text-secondary-foreground px-3 py-2 rounded-tl-xl rounded-tr-xl rounded-bl-xl":
										role === "user",
								})}
							>
								<Markdown>{content as string}</Markdown>
							</div>
						</motion.div>
					</div>
				</div>
			</motion.div>
		</AnimatePresence>
	);
};

export const ThinkingMessage = () => {
	const role = "assistant";

	return (
		<motion.div
			animate={{ opacity: 1 }}
			className="group/message w-full px-4"
			data-role={role}
			exit={{ opacity: 0, transition: { duration: 0.5 } }}
			initial={{ opacity: 0 }}
			transition={{ duration: 0.2 }}
		>
			<div className="flex items-start justify-start gap-3">
				<div className="-mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
					<SparklesIcon size={14} />
				</div>

				<div className="flex w-full flex-col gap-2 md:gap-4">
					<div className="p-0 text-muted-foreground text-sm">
						<Shimmer>Thinking...</Shimmer>
					</div>
				</div>
			</div>
		</motion.div>
	);
};
