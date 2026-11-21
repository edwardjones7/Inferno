import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveTableScreen } from "./live-table-screen";

export const metadata: Metadata = { title: "Friends' table" };

export default function LiveTablePage() {
  return (
    <Suspense fallback={<div className="felt absolute inset-0" />}>
      <LiveTableScreen />
    </Suspense>
  );
}
