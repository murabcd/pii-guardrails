"use client";

import { ChevronUp, Loader2 } from "lucide-react";
import Image from "next/image";
import type { User } from "next-auth";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { SettingsDialog } from "@/components/settings-dialog";
import { useSettings } from "@/components/settings-provider";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";

export function SidebarUserNav({ user }: { user: User }) {
	const { status } = useSession();
	const { setTheme, resolvedTheme } = useTheme();
	const {
		similarityThreshold,
		setSimilarityThreshold,
		enabledEntities,
		setEnabledEntities,
	} = useSettings();
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);

	return (
		<>
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							{status === "loading" ? (
								<SidebarMenuButton className="h-10 justify-between bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
									<div className="flex flex-row gap-2">
										<div className="size-6 animate-pulse rounded-full bg-muted" />
										<span className="animate-pulse rounded-md bg-muted text-transparent">
											Loading auth status
										</span>
									</div>
									<div className="animate-spin text-muted-foreground">
										<Loader2 size={16} />
									</div>
								</SidebarMenuButton>
							) : (
								<SidebarMenuButton
									className="h-10 bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
									data-testid="user-nav-button"
								>
									<Image
										alt={user.email ?? "User Avatar"}
										className="rounded-full grayscale"
										height={24}
										src={`https://avatar.vercel.sh/${user.email}`}
										width={24}
									/>
									<span className="truncate" data-testid="user-email">
										{user?.email}
									</span>
									<ChevronUp className="ml-auto" size={16} />
								</SidebarMenuButton>
							)}
						</DropdownMenuTrigger>
						<DropdownMenuContent
							className="w-(--radix-popper-anchor-width)"
							data-testid="user-nav-menu"
							side="top"
						>
							<DropdownMenuItem
								className="cursor-pointer"
								data-testid="user-nav-item-theme"
								onSelect={() =>
									setTheme(resolvedTheme === "dark" ? "light" : "dark")
								}
							>
								{`Toggle ${resolvedTheme === "light" ? "dark" : "light"} mode`}
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer"
								data-testid="user-nav-item-settings"
								onSelect={() => setIsSettingsOpen(true)}
							>
								<span>Settings</span>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem asChild data-testid="user-nav-item-auth">
								<button
									className="w-full cursor-pointer"
									onClick={() => {
										if (status === "loading") {
											return;
										}

										signOut({
											redirectTo: "/",
										});
									}}
									type="button"
								>
									Sign out
								</button>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
			</SidebarMenu>
			<SettingsDialog
				similarityThreshold={similarityThreshold}
				onThresholdChange={setSimilarityThreshold}
				enabledEntities={enabledEntities}
				onEntitiesChange={setEnabledEntities}
				open={isSettingsOpen}
				onOpenChange={setIsSettingsOpen}
			/>
		</>
	);
}
