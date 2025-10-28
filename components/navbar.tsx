import { auth, signOut } from "@/app/(auth)/auth";
import Link from "next/link";
import { History } from "./history";

export const Navbar = async () => {
	const session = await auth();

	return (
		<div className="bg-background absolute top-0 left-0 w-dvw border-b border-border py-2 px-3 justify-between flex flex-row items-center z-30">
			<div className="flex flex-row gap-3 items-center">
				<History />
				<div className="text-sm text-foreground">PII RAG</div>
			</div>

			{session ? (
				<div className="group py-1 px-2 rounded-md hover:bg-accent cursor-pointer relative">
					<div className="text-sm text-muted-foreground z-10">
						{session.user?.email}
					</div>
					<div className="flex-col absolute top-6 right-0 w-full pt-5 group-hover:flex hidden">
						<form
							action={async () => {
								"use server";
								await signOut();
							}}
						>
							<button
								type="submit"
								className="text-sm w-full p-1 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								Sign out
							</button>
						</form>
					</div>
				</div>
			) : (
				<Link
					href="login"
					className="text-sm p-1 px-2 bg-primary rounded-md text-primary-foreground hover:bg-primary/90"
				>
					Login
				</Link>
			)}
		</div>
	);
};
