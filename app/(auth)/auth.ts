import { compare } from "bcrypt-ts";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getUser } from "@/lib/db/db";
import { authConfig } from "./auth.config";

export const {
	handlers: { GET, POST },
	auth,
	signIn,
	signOut,
} = NextAuth({
	...authConfig,
	providers: [
		Credentials({
			async authorize(credentials) {
				const { email, password } = credentials as {
					email: string;
					password: string;
				};
				const user = await getUser(email);
				if (user.length === 0) return null;
				const userPassword = user[0]?.password;
				if (!userPassword) return null;
				const passwordsMatch = await compare(password, userPassword);
				if (passwordsMatch) return user[0];
				return null;
			},
		}),
	],
});
