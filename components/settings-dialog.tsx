"use client";

import { Database, Shield } from "lucide-react";
import * as React from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@/components/ui/sidebar";
import { Slider } from "@/components/ui/slider";
import type { GuardrailEntityType } from "@/lib/ai/guardrails";
import { GUARDRAIL_ENTITIES } from "@/lib/ai/guardrails";

type SettingsSection = "settings" | "guardrails";

const settingsNav = [
	{ name: "Settings", icon: Database, id: "settings" as SettingsSection },
	{ name: "Guardrails", icon: Shield, id: "guardrails" as SettingsSection },
];

interface SettingsDialogProps {
	similarityThreshold: number;
	onThresholdChange: (threshold: number) => void;
	enabledEntities: GuardrailEntityType[];
	onEntitiesChange: (entities: GuardrailEntityType[]) => void;
	trigger?: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

export function SettingsDialog({
	similarityThreshold,
	onThresholdChange,
	enabledEntities,
	onEntitiesChange,
	trigger,
	open: openProp,
	onOpenChange: onOpenChangeProp,
}: SettingsDialogProps) {
	const [internalOpen, setInternalOpen] = React.useState(false);
	const open = openProp ?? internalOpen;
	const setOpen = onOpenChangeProp ?? setInternalOpen;
	const [activeSection, setActiveSection] =
		React.useState<SettingsSection>("settings");
	const [localThreshold, setLocalThreshold] =
		React.useState(similarityThreshold);
	const [localEntities, setLocalEntities] =
		React.useState<GuardrailEntityType[]>(enabledEntities);

	React.useEffect(() => {
		setLocalThreshold(similarityThreshold);
	}, [similarityThreshold]);

	React.useEffect(() => {
		setLocalEntities(enabledEntities);
	}, [enabledEntities]);

	const handleSave = () => {
		onThresholdChange(localThreshold);
		onEntitiesChange(localEntities);
		setOpen(false);
	};

	const handleCancel = () => {
		setLocalThreshold(similarityThreshold);
		setLocalEntities(enabledEntities);
		setOpen(false);
	};

	const handleEntityToggle = (
		entityId: GuardrailEntityType,
		checked: boolean,
	) => {
		if (checked) {
			setLocalEntities([...localEntities, entityId]);
		} else {
			setLocalEntities(localEntities.filter((id) => id !== entityId));
		}
	};

	const renderSettings = () => (
		<div className="grid gap-4 py-4">
			<div className="grid gap-2">
				<Label htmlFor="similarity-threshold" className="text-sm font-medium">
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
	);

	const renderGuardrailsSettings = () => (
		<div className="grid gap-4 py-4">
			<div className="space-y-4">
				<Label className="text-sm font-medium">Identifiers</Label>

				<div className="flex flex-col gap-4">
					{GUARDRAIL_ENTITIES.map((entity) => {
						const isChecked = localEntities.includes(entity.id);
						return (
							<div
								key={entity.id}
								className="flex items-start space-x-2 p-3 rounded-lg border hover:bg-accent/50 transition-colors"
							>
								<Checkbox
									id={entity.id}
									checked={isChecked}
									onCheckedChange={(checked) =>
										handleEntityToggle(entity.id, checked === true)
									}
									className="mt-0.5"
								/>
								<div className="flex-1 space-y-1">
									<Label
										htmlFor={entity.id}
										className="text-sm font-medium cursor-pointer leading-none"
									>
										{entity.label}
									</Label>
									<p className="text-xs text-muted-foreground font-mono">
										{entity.example}
									</p>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);

	const renderContent = () => {
		switch (activeSection) {
			case "settings":
				return renderSettings();
			case "guardrails":
				return renderGuardrailsSettings();
			default:
				return null;
		}
	};

	const activeNavItem = settingsNav.find((item) => item.id === activeSection);

	const dialogContent = (
		<DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[700px] lg:max-w-[800px]">
			<DialogTitle className="sr-only">Settings</DialogTitle>
			<DialogDescription className="sr-only">
				Customize your settings here.
			</DialogDescription>
			<SidebarProvider className="items-start">
				<Sidebar collapsible="none" className="hidden md:flex">
					<SidebarContent>
						<SidebarGroup>
							<SidebarGroupContent>
								<SidebarMenu>
									{settingsNav.map((item) => (
										<SidebarMenuItem key={item.id}>
											<SidebarMenuButton
												isActive={activeSection === item.id}
												onClick={() => setActiveSection(item.id)}
											>
												<item.icon />
												<span>{item.name}</span>
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					</SidebarContent>
				</Sidebar>
				<main className="flex h-[580px] flex-1 flex-col overflow-hidden">
					<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
						<div className="flex items-center gap-2 px-4">
							<Breadcrumb>
								<BreadcrumbList>
									<BreadcrumbItem className="hidden md:block">
										<BreadcrumbPage>Settings</BreadcrumbPage>
									</BreadcrumbItem>
									<BreadcrumbSeparator className="hidden md:block" />
									<BreadcrumbItem>
										<BreadcrumbPage>
											{activeNavItem?.name || "Settings"}
										</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
						</div>
					</header>
					<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
						{renderContent()}
					</div>
					<div className="flex justify-end gap-2 p-4">
						<Button variant="outline" onClick={handleCancel}>
							Cancel
						</Button>
						<Button onClick={handleSave}>Save</Button>
					</div>
				</main>
			</SidebarProvider>
		</DialogContent>
	);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
			{dialogContent}
		</Dialog>
	);
}
