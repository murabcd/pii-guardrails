"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { SidebarHistory } from "@/components/sidebar-history";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	useSidebar,
} from "@/components/ui/sidebar";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "./ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function AppSidebar({ user }: { user: User | undefined }) {
	const router = useRouter();
	const { setOpenMobile } = useSidebar();
	const { mutate } = useSWRConfig();
	const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

	const handleDeleteAll = async () => {
		try {
			const response = await fetch("/api/history", {
				method: "DELETE",
			});

			if (response.ok) {
				toast.success("All chats deleted successfully");
				mutate("/api/history");
				router.push("/");
				setShowDeleteAllDialog(false);
			} else {
				toast.error("Failed to delete all chats");
			}
		} catch (_error) {
			toast.error("Failed to delete all chats");
		}
	};

	return (
		<>
			<Sidebar className="group-data-[side=left]:border-r-0">
				<SidebarHeader>
					<SidebarMenu>
						<div className="flex flex-row items-center justify-between">
							<Link
								className="flex flex-row items-center gap-3"
								href="/"
								onClick={() => {
									setOpenMobile(false);
								}}
							>
								<span className="cursor-pointer rounded-md px-2 font-semibold text-lg hover:bg-muted">
									PII Guardrails
								</span>
							</Link>
							<div className="flex flex-row gap-1">
								{user && (
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												className="h-8 p-1 md:h-fit md:p-2"
												onClick={() => setShowDeleteAllDialog(true)}
												type="button"
												variant="ghost"
											>
												<Trash2 size={16} />
											</Button>
										</TooltipTrigger>
										<TooltipContent align="end" className="hidden md:block">
											Delete all chats
										</TooltipContent>
									</Tooltip>
								)}
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											className="h-8 p-1 md:h-fit md:p-2"
											onClick={() => {
												setOpenMobile(false);
												router.push("/");
												router.refresh();
											}}
											type="button"
											variant="ghost"
										>
											<Plus size={16} />
										</Button>
									</TooltipTrigger>
									<TooltipContent align="end" className="hidden md:block">
										New chat
									</TooltipContent>
								</Tooltip>
							</div>
						</div>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent>
					<SidebarHistory user={user} />
				</SidebarContent>
				<SidebarFooter>
					{user ? (
						<SidebarUserNav user={user} />
					) : (
						<Button
							asChild
							className="w-full justify-center"
							onClick={() => setOpenMobile(false)}
							variant="secondary"
						>
							<Link href="/login">Log in</Link>
						</Button>
					)}
				</SidebarFooter>
			</Sidebar>

			<AlertDialog
				onOpenChange={setShowDeleteAllDialog}
				open={showDeleteAllDialog}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. This will permanently delete all
							your chats and remove them from our servers.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleDeleteAll}>
							Continue
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
