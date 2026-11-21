import type { Metadata } from "next";
import { Suspense } from "react";
import { FriendsScreen } from "./friends-screen";

export const metadata: Metadata = { title: "Friends" };

export default function FriendsPage() {
  return (
    <Suspense fallback={null}>
      <FriendsScreen />
    </Suspense>
  );
}
