"use client";

import cx from "classnames";
import { CheckSquare, Info, Loader2, Square, Trash2 } from "lucide-react";
import { type Dispatch, type SetStateAction, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { fetcher } from "@/utils/functions";

export const Files = ({
	selectedFilePathnames,
	setSelectedFilePathnames,
	isOpen,
	onOpenChange,
}: {
	selectedFilePathnames: string[];
	setSelectedFilePathnames: Dispatch<SetStateAction<string[]>>;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const inputFileRef = useRef<HTMLInputElement>(null);
	const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);
	const [deleteQueue, setDeleteQueue] = useState<Array<string>>([]);
	const {
		data: files,
		mutate,
		isLoading,
	} = useSWR<
		Array<{
			pathname: string;
			url: string;
		}>
	>("/api/files/list", fetcher, {
		fallbackData: [],
	});

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						Manage Knowledge Base
					</DialogTitle>
				</DialogHeader>

				<input
					name="file"
					ref={inputFileRef}
					type="file"
					required
					className="opacity-0 pointer-events-none w-1"
					accept="application/pdf"
					multiple={false}
					onChange={async (event) => {
						const file = event.target.files?.[0];

						if (file) {
							setUploadQueue((currentQueue) => [...currentQueue, file.name]);

							await fetch(`/api/files/upload?filename=${file.name}`, {
								method: "POST",
								body: file,
							});

							setUploadQueue((currentQueue) =>
								currentQueue.filter((filename) => filename !== file.name),
							);

							mutate([...(files || []), { pathname: file.name, url: "" }]);
						}
					}}
				/>

				<div className="flex flex-col h-full overflow-y-scroll max-h-[400px]">
					{isLoading ? (
						<div className="flex flex-col">
							{[44, 32, 52].map((item) => (
								<div
									key={item}
									className="flex flex-row gap-4 p-2 border-b border-border items-center"
								>
									<div className="size-4 bg-muted animate-pulse" />
									<div className={`w-${item} h-4 bg-muted animate-pulse`} />
									<div className="h-[24px] w-1" />
								</div>
							))}
						</div>
					) : null}

					{!isLoading &&
					files?.length === 0 &&
					uploadQueue.length === 0 &&
					deleteQueue.length === 0 ? (
						<div className="flex flex-col gap-4 items-center justify-center h-full">
							<div className="flex flex-row gap-2 items-center text-muted-foreground text-sm">
								<Info size={16} className="text-current" />
								<div>No files found</div>
							</div>
						</div>
					) : null}

					{files?.map((file: { pathname: string; url: string }) => (
						<div
							key={file.pathname}
							className={`flex flex-row p-2 border-b border-border ${
								selectedFilePathnames.includes(file.pathname) ? "bg-accent" : ""
							}`}
						>
							<button
								type="button"
								className="flex flex-row items-center justify-between w-full gap-4"
								onClick={() => {
									setSelectedFilePathnames((currentSelections) => {
										if (currentSelections.includes(file.pathname)) {
											return currentSelections.filter(
												(path) => path !== file.pathname,
											);
										} else {
											return [...currentSelections, file.pathname];
										}
									});
								}}
							>
								<div
									className={cx(
										"cursor-pointer",
										selectedFilePathnames.includes(file.pathname) &&
											!deleteQueue.includes(file.pathname)
											? "text-primary"
											: "text-muted-foreground",
									)}
								>
									{deleteQueue.includes(file.pathname) ? (
										<div className="animate-spin">
											<Loader2 size={16} className="text-current" />
										</div>
									) : selectedFilePathnames.includes(file.pathname) ? (
										<CheckSquare size={16} className="text-current" />
									) : (
										<Square size={16} className="text-current" />
									)}
								</div>

								<div className="flex flex-row justify-between w-full">
									<div className="text-sm text-muted-foreground">
										{file.pathname}
									</div>
								</div>
							</button>

							<button
								type="button"
								className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive p-1 px-2 cursor-pointer rounded-md"
								onClick={async () => {
									setDeleteQueue((currentQueue) => [
										...currentQueue,
										file.pathname,
									]);

									await fetch(`/api/files/delete?fileurl=${file.url}`, {
										method: "DELETE",
									});

									setDeleteQueue((currentQueue) =>
										currentQueue.filter(
											(filename) => filename !== file.pathname,
										),
									);

									setSelectedFilePathnames((currentSelections) =>
										currentSelections.filter((path) => path !== file.pathname),
									);

									mutate(files.filter((f) => f.pathname !== file.pathname));
								}}
							>
								<Trash2 size={16} className="text-current" />
							</button>
						</div>
					))}

					{uploadQueue.map((fileName) => (
						<div
							key={fileName}
							className="flex flex-row justify-between p-2 gap-4 items-center"
						>
							<div className="text-muted-foreground">
								<div className="animate-spin">
									<Loader2 size={16} className="text-current" />
								</div>
							</div>

							<div className="flex flex-row justify-between w-full">
								<div className="text-sm text-muted-foreground">{fileName}</div>
							</div>

							<div className="h-[24px] w-2" />
						</div>
					))}
				</div>

				<DialogFooter className="flex flex-row justify-between items-center">
					<div className="text-muted-foreground text-sm">
						{`${selectedFilePathnames.length}/${files?.length}`} Selected
					</div>
					<Button
						onClick={() => {
							inputFileRef.current?.click();
						}}
					>
						Upload a file
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
