import type { Metadata } from "next";
import { LearnPath } from "./learn-path";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return <LearnPath />;
}
