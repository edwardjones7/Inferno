import type { Metadata } from "next";
import { Suspense } from "react";
import { Review } from "./review";

export const metadata: Metadata = { title: "The Books" };

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-10 h-96 max-w-5xl animate-pulse rounded-3xl bg-ash-900" />}>
      <Review />
    </Suspense>
  );
}
