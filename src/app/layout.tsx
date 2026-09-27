import type { Metadata } from "next";
import { DM_Mono, DM_Sans, Instrument_Serif } from "next/font/google";
import "./blueprint.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import { NoAccess } from "@/components/shell/no-access";
import { userDb } from "@/server/db";

const sans = DM_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Loura — platform prototype",
  description: "Create, collaborate, and carry activities forward with agents.",
  icons: { icon: "/Loura%20Symbol.png" },
};

async function sessionState(): Promise<"anonymous" | "member" | "no-access"> {
  const db = userDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return "anonymous";
  const { data } = await db.from("members").select("status").eq("user_id", user.id).maybeSingle();
  return data?.status === "active" ? "member" : "no-access";
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const state = await sessionState();
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
        <Providers>
          {state === "member" ? <AppShell>{children}</AppShell> : state === "no-access" ? <NoAccess /> : children}
        </Providers>
      </body>
    </html>
  );
}
