import type { Metadata } from "next";
import { TrainHub } from "./train-hub";

export const metadata: Metadata = { title: "Train" };

export default function TrainPage() {
  return <TrainHub />;
}
