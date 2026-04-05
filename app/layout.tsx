import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "FastTrack NYC",
  description:
    "Find faster New York City commutes by combining transit with micromobility.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full scroll-smooth", "font-sans", geist.variable)}>
      <body className="min-h-full bg-[var(--page)] text-[var(--ink)] antialiased">
        {children}
      </body>
    </html>
  );
}
