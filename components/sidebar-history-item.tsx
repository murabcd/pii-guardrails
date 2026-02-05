import { isTextUIPart } from "ai";
import { MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import type { Chat } from "@/lib/db/schema";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
} from "./ui/sidebar";

const PureChatItem = ({
	chat,
	isActive,
	onDelete,
	setOpenMobile,
}: {
	chat: Chat;
	isActive: boolean;
	onDelete: (chatId: string) => void;
	setOpenMobile: (open: boolean) => void;
}) => {
	const chatTitle =
		chat.messages[0]?.parts
			?.filter(isTextUIPart)
			.map((part) => part.text)
			.join(" ") || "Untitled Chat";

	return (
		<SidebarMenuItem>
			<SidebarMenuButton asChild isActive={isActive}>
				<Link href={`/chat/${chat.id}`} onClick={() => setOpenMobile(false)}>
					<span>{chatTitle}</span>
				</Link>
			</SidebarMenuButton>

			<DropdownMenu modal={true}>
				<DropdownMenuTrigger asChild>
					<SidebarMenuAction
						className="mr-0.5 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						showOnHover={!isActive}
					>
						<MoreHorizontal size={16} />
						<span className="sr-only">More</span>
					</SidebarMenuAction>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" side="bottom">
					<DropdownMenuItem
						className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive"
						onSelect={() => onDelete(chat.id)}
					>
						<Trash2 size={16} />
						<span>Delete</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	);
};

export const ChatItem = memo(PureChatItem, (prevProps, nextProps) => {
	if (prevProps.isActive !== nextProps.isActive) {
		return false;
	}
	return true;
});
