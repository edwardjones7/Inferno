import type { Metadata } from "next";
import { PokerTable } from "../poker-table";

export const metadata: Metadata = { title: "6-max table" };

export default function TablePage() {
  return (
    <PokerTable mode="table" />
  );
}
