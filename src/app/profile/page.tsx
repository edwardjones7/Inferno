import type { Metadata } from "next";
import { Profile } from "./profile";

export const metadata: Metadata = { title: "Your File" };

export default function ProfilePage() {
  return <Profile />;
}
