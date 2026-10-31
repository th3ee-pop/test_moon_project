import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "月相观察实验室",
  description:
    "小学科学月相变化探究工具：拖动日期观察月相，完成探究任务，行为过程自动记录。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
