import type { Metadata } from "next";
import { TrainHub } from "./train-hub";

export const metadata: Metadata = { title: "School" };

export default function TrainPage() {
  return <TrainHub />;
}
