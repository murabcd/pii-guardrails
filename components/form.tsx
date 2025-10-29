export function Form({
	action,
	children,
}: {
	action: any;
	children: React.ReactNode;
}) {
	return (
		<form action={action} className="flex flex-col gap-4 px-4 sm:px-16">
			<div>
				<label htmlFor="email" className="block text-sm text-muted-foreground">
					Email Address
				</label>
				<input
					id="email"
					name="email"
					type="email"
					placeholder="user@acme.com"
					autoComplete="email"
					required
					className="mt-1 block w-full appearance-none rounded-md bg-muted px-3 py-2 placeholder-muted-foreground focus:ring-ring focus:outline-none sm:text-sm text-foreground"
				/>
			</div>
			<div>
				<label
					htmlFor="password"
					className="block text-sm text-muted-foreground"
				>
					Password
				</label>
				<input
					id="password"
					name="password"
					type="password"
					required
					className="mt-1 block w-full appearance-none rounded-md bg-muted px-3 py-2 placeholder-muted-foreground focus:ring-ring focus:outline-none sm:text-sm text-foreground"
				/>
			</div>
			{children}
		</form>
	);
}
