import type { Metadata } from "next";
import { PokerTable } from "../poker-table";

export const metadata: Metadata = { title: "6-max table" };

export default function TablePage() {
  return (
    <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-6">
      <PokerTable mode="table" />
    </div>
  );
}
