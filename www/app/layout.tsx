import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "globlin – A faster glob for Node.js",
  description:
    "20-30x faster drop-in replacement for glob. Built in Rust with NAPI-RS.",
  keywords: ["glob", "node.js", "rust", "fast", "pattern matching", "file system"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
