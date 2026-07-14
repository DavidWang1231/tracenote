import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const description = "只依据你提供的资料进行总结、问答与引用核对。";

  return {
    title: "溯源 · 资料研究助手",
    description,
    openGraph: {
      title: "溯源 · 让每个结论，都回到原文",
      description,
      images: [{ url: new URL("/og.png", origin).toString(), width: 1744, height: 909 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "溯源 · 让每个结论，都回到原文",
      description,
      images: [new URL("/og.png", origin).toString()],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
