import type { DefaultSession } from "next-auth";

// Session/JWT carry id + role. Role is a UI hint only — admin APIs re-check
// the database via getAdminUser() in src/lib/current-user.ts.
declare module "next-auth" {
  interface User {
    role?: string;
  }

  interface Session {
    user: {
      id: string;
      role?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
  }
}
