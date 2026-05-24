import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcryptjs from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
});

// Extra fields we attach to the JWT beyond what next-auth's User type defines.
interface AuthUser {
  id: string;
  email: string;
  name: string;
  username: string;
  roleKey: string;
  departmentKey: string;
  isAdmin: boolean;
  languagePref: string;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<AuthUser | null> {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { username: parsed.data.username.toLowerCase().trim() },
          include: { role: true, department: true },
        });

        if (!user || !user.isActive) return null;

        const valid = await bcryptjs.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        // Update last login timestamp non-blocking.
        void prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          username: user.username,
          roleKey: user.role.key,
          departmentKey: user.department.key,
          isAdmin: user.role.isAdmin,
          languagePref: user.languagePref,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // Cast through unknown because next-auth's User type is narrower than AuthUser.
        const u = user as unknown as AuthUser;
        token["userId"] = u.id;
        token["username"] = u.username;
        token["roleKey"] = u.roleKey;
        token["departmentKey"] = u.departmentKey;
        token["isAdmin"] = u.isAdmin;
        token["languagePref"] = u.languagePref;
      }
      return token;
    },
    session({ session, token }) {
      const s = session.user as unknown as Record<string, unknown>;
      s["id"] = token["userId"];
      s["username"] = token["username"];
      s["roleKey"] = token["roleKey"];
      s["departmentKey"] = token["departmentKey"];
      s["isAdmin"] = token["isAdmin"];
      s["languagePref"] = token["languagePref"];
      return session;
    },
  },
});
