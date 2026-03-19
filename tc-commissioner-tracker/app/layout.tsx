import type { Metadata } from "next";
import { Newsreader, Manrope } from "next/font/google";
import Link from "next/link";
import { MeetingsProvider } from "@/lib/meetings-context";
import NavLinks from "@/components/NavLinks";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Civic Ledger — Transylvania County Commissioner Tracker",
  description: "A civic accountability ledger tracking Transylvania County Commissioner activity across meetings, votes, and public statements",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${manrope.variable} h-full antialiased`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col font-body bg-surface text-on-surface selection:bg-primary-fixed selection:text-on-primary-fixed">
        {/* Top Nav */}
        <header className="fixed top-0 w-full z-50 bg-surface/95 backdrop-blur-[20px]">
          <div className="flex justify-between items-center px-6 lg:px-12 py-4 max-w-screen-2xl mx-auto">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex flex-col">
                <span className="text-2xl font-bold italic text-primary font-headline">Civic Ledger</span>
                <span className="text-[10px] text-secondary font-bold tracking-widest uppercase">Transylvania County · Informed Arbiter Edition</span>
              </Link>
              <nav className="hidden md:flex gap-6 items-center">
                <NavLinks />
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">settings</span>
            </div>
          </div>
          <div className="h-px w-full bg-surface-container-low" />
        </header>

        <MeetingsProvider>
          <main className="flex-1 min-h-screen pt-[73px]">
            {children}
          </main>
        </MeetingsProvider>

        {/* Mobile Bottom Nav */}
        <div className="md:hidden fixed bottom-0 w-full bg-surface flex justify-around items-center py-3 z-50 border-t border-outline-variant/10">
          <Link href="/" className="flex flex-col items-center text-primary">
            <span className="material-symbols-outlined">dashboard</span>
            <span className="text-[10px] font-bold uppercase">Dashboard</span>
          </Link>
          <Link href="/commissioners" className="flex flex-col items-center text-secondary">
            <span className="material-symbols-outlined">groups</span>
            <span className="text-[10px] font-bold uppercase">Commissioners</span>
          </Link>
          <Link href="/topics/fiscal" className="flex flex-col items-center text-secondary">
            <span className="material-symbols-outlined">topic</span>
            <span className="text-[10px] font-bold uppercase">Topics</span>
          </Link>
          <Link href="/follow-ups" className="flex flex-col items-center text-secondary">
            <span className="material-symbols-outlined">checklist</span>
            <span className="text-[10px] font-bold uppercase">Follow-ups</span>
          </Link>
          <Link href="/meetings" className="flex flex-col items-center text-secondary">
            <span className="material-symbols-outlined">event</span>
            <span className="text-[10px] font-bold uppercase">Meetings</span>
          </Link>
        </div>
      </body>
    </html>
  );
}
