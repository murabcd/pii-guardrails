import Link from "next/link";
import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const NonMemoizedMarkdown = ({ children }: { children: string }) => {
	const components: Components = {
		code({ node, className, children, ...props }) {
			const match = /language-(\w+)/.exec(className || "");
			return match ? (
				<pre
					className={`${className} text-sm w-[80dvw] md:max-w-[500px] overflow-x-scroll bg-muted p-2 rounded mt-2`}
				>
					<code {...props} className={match[1]}>
						{children}
					</code>
				</pre>
			) : (
				<code
					className={`${className} text-sm bg-muted py-0.5 px-1 rounded`}
					{...props}
				>
					{children}
				</code>
			);
		},
		ol({ node, children, ...props }) {
			return (
				<ol className="list-decimal list-outside ml-4" {...props}>
					{children}
				</ol>
			);
		},
		li({ node, children, ...props }) {
			return (
				<li className="py-1" {...props}>
					{children}
				</li>
			);
		},
		ul({ node, children, ...props }) {
			return (
				<ul className="list-decimal list-outside ml-4" {...props}>
					{children}
				</ul>
			);
		},
		strong({ node, children, ...props }) {
			return (
				<span className="font-semibold" {...props}>
					{children}
				</span>
			);
		},
		a({ node, children, ...props }) {
			const { href, ...rest } = props;
			if (!href) {
				return <span className="text-primary">{children}</span>;
			}
			return (
				<Link
					className="text-primary hover:underline"
					target="_blank"
					rel="noreferrer"
					href={href}
					{...rest}
				>
					{children}
				</Link>
			);
		},
	};

	return (
		<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
			{children}
		</ReactMarkdown>
	);
};

export const Markdown = React.memo(
	NonMemoizedMarkdown,
	(prevProps, nextProps) => prevProps.children === nextProps.children,
);
