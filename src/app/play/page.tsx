import type { Metadata } from "next";
import { PlayHub } from "./play-hub";

export const metadata: Metadata = { title: "Tables" };

export default function PlayPage() {
  return <PlayHub />;
}
