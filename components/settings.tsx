"use client";

import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface SettingsProps {
	similarityThreshold: number;
	onThresholdChange: (threshold: number) => void;
}

export function SettingsModal({
	similarityThreshold,
	onThresholdChange,
}: SettingsProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [localThreshold, setLocalThreshold] = useState(similarityThreshold);

	useEffect(() => {
		setLocalThreshold(similarityThreshold);
	}, [similarityThreshold]);

	const handleSave = () => {
		onThresholdChange(localThreshold);
		setIsOpen(false);
	};

	const handleCancel = () => {
		setLocalThreshold(similarityThreshold);
		setIsOpen(false);
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="relative text-sm bg-muted rounded-lg size-9 flex-shrink-0 flex flex-row items-center justify-center cursor-pointer hover:bg-accent"
				>
					<Settings size={16} />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						RAG Settings
					</DialogTitle>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label
							htmlFor="similarity-threshold"
							className="text-sm font-medium"
						>
							Similarity Threshold
						</Label>
						<div className="space-y-2">
							<Slider
								id="similarity-threshold"
								min={0}
								max={1}
								step={0.01}
								value={[localThreshold]}
								onValueChange={(value) => setLocalThreshold(value[0])}
								className="w-full"
							/>
							<div className="flex justify-between text-xs text-muted-foreground">
								<span>More Strict (0.0)</span>
								<span className="font-mono">{localThreshold.toFixed(2)}</span>
								<span>More Lenient (1.0)</span>
							</div>
							<p className="text-xs text-muted-foreground">
								Lower values return only highly similar content. Higher values
								include more diverse results.
							</p>
						</div>
					</div>
				</div>
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={handleCancel}>
						Cancel
					</Button>
					<Button onClick={handleSave}>Save</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
