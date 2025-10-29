import { openai } from "@ai-sdk/openai";
import { wrapLanguageModel } from "ai";
import { guardrailMiddleware } from "./middleware/guardrail";

const baseModel = openai("gpt-4o");

export const customModel = wrapLanguageModel({
	model: baseModel,
	middleware: guardrailMiddleware,
});
