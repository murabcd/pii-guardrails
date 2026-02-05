import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
	path: ".env",
});

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
	throw new Error("POSTGRES_URL environment variable is required");
}

export default defineConfig({
	schema: "./lib/db/schema.ts",
	out: "./lib/db/migration",
	dialect: "postgresql",
	dbCredentials: {
		url: postgresUrl,
	},
});
