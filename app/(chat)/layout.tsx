import { cookies } from "next/headers";
import { AppSidebar } from "@/components/app-sidebar";
import { SettingsProvider } from "@/components/settings-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "../(auth)/auth";

export default async function Layout({
	children,
}: {
	children: React.ReactNode;
}) {
	const [session, cookieStore] = await Promise.all([auth(), cookies()]);
	const isCollapsed = cookieStore.get("sidebar_state")?.value !== "true";

	return (
		<SettingsProvider session={session}>
			<SidebarProvider defaultOpen={!isCollapsed}>
				<AppSidebar user={session?.user} />
				<SidebarInset>{children}</SidebarInset>
			</SidebarProvider>
		</SettingsProvider>
	);
}
