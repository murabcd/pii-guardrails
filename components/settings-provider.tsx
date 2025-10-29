"use client";

import type { Session } from "next-auth";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import {
	loadGuardrailSettings,
	saveGuardrailSettings,
} from "@/lib/ai/guardrail-settings-storage";
import type { GuardrailEntityType } from "@/lib/ai/guardrails";

type SettingsContextType = {
	similarityThreshold: number;
	setSimilarityThreshold: (threshold: number) => void;
	enabledEntities: GuardrailEntityType[];
	setEnabledEntities: (entities: GuardrailEntityType[]) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(
	undefined,
);

export function useSettings() {
	const context = useContext(SettingsContext);
	if (!context) {
		throw new Error("useSettings must be used within a SettingsProvider");
	}
	return context;
}

export function SettingsProvider({
	children,
	session,
}: {
	children: React.ReactNode;
	session: Session | null;
}) {
	const [similarityThreshold, setSimilarityThreshold] = useState(1.0);
	const [enabledEntities, setEnabledEntities] = useState<GuardrailEntityType[]>(
		[],
	);

	useEffect(() => {
		if (session?.user?.email) {
			const savedThreshold = localStorage.getItem(
				`${session.user.email}/similarity-threshold`,
			);
			if (savedThreshold) {
				setSimilarityThreshold(parseFloat(savedThreshold));
			} else {
				setSimilarityThreshold(1.0);
			}
			const savedEntities = loadGuardrailSettings(session.user.email);
			setEnabledEntities(savedEntities);
		} else {
			// Reset to defaults if no session
			setSimilarityThreshold(1.0);
			setEnabledEntities([]);
		}
	}, [session]);

	useEffect(() => {
		if (session?.user?.email) {
			localStorage.setItem(
				`${session.user.email}/similarity-threshold`,
				similarityThreshold.toString(),
			);
		}
	}, [similarityThreshold, session]);

	useEffect(() => {
		if (session?.user?.email) {
			saveGuardrailSettings(enabledEntities, session.user.email);
		}
	}, [enabledEntities, session]);

	return (
		<SettingsContext.Provider
			value={{
				similarityThreshold,
				setSimilarityThreshold,
				enabledEntities,
				setEnabledEntities,
			}}
		>
			{children}
		</SettingsContext.Provider>
	);
}
