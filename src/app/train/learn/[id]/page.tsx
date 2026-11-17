import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lessonById, LESSONS } from "@/lib/learn";
import { LessonPlayer } from "./lesson-player";

type Props = { params: Promise<{ id: string }> };

// Static export: every lesson page is generated at build time, nothing else exists.
export const dynamicParams = false;

export function generateStaticParams() {
  return LESSONS.map((l) => ({ id: l.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: lessonById(id)?.title ?? "Lesson" };
}

export default async function LessonPage({ params }: Props) {
  const { id } = await params;
  if (!lessonById(id)) notFound();
  return <LessonPlayer id={id} />;
}
