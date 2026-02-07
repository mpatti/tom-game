import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Capture The Flag - 3v3 Multiplayer",
  description: "Real-time 3v3 capture the flag game. Play with friends!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
