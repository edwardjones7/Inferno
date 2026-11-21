import type { Metadata } from "next";
import { FriendsTables } from "./friends-tables";

export const metadata: Metadata = { title: "Play with friends" };

export default function FriendsTablesPage() {
  return <FriendsTables />;
}
