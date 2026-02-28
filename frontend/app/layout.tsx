import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arche GTM Engine",
  description: "Healthcare Go-to-Market Marketing Engine by Arche Studios",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 font-sans">
        {children}
      </body>
    </html>
  );
}
