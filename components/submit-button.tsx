"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children }: { children: React.ReactNode }) {
	const { pending } = useFormStatus();

	return (
		<button
			type={pending ? "button" : "submit"}
			aria-disabled={pending}
			className="relative flex flex-row gap-4 p-2 w-full items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm transition-all focus:outline-none"
		>
			{children}
			{pending && (
				<span className="animate-spin absolute right-4">
					<Loader2 size={16} className="text-current" />
				</span>
			)}
			<output aria-live="polite" className="sr-only">
				{pending ? "Loading" : "Submit form"}
			</output>
		</button>
	);
}
