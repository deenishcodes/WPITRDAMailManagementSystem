import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mail Management System",
  description: "Government correspondence and physical delivery tracking.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
