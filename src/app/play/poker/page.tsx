import type { Metadata } from "next";
import { BotLobby } from "./bot-lobby";

export const metadata: Metadata = { title: "Poker vs bots" };

export default function PokerLobbyPage() {
  return <BotLobby />;
}
