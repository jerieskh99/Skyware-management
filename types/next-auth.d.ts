import type { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      roleKey: string;
      departmentKey: string;
      isAdmin: boolean;
      languagePref: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    username: string;
    roleKey: string;
    departmentKey: string;
    isAdmin: boolean;
    languagePref: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    username: string;
    roleKey: string;
    departmentKey: string;
    isAdmin: boolean;
    languagePref: string;
  }
}
