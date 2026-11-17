import Link from "next/link";

/** Shared layout for the privacy policy and terms: one readable column, sized for phones. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-4 pb-16 pt-5 sm:px-6 lg:pt-10">
      <Link href="/profile/" className="text-xs font-bold text-ash-400 hover:text-bone">
        ← Profile
      </Link>
      <p className="mt-5 eyebrow">Legal</p>
      <h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">{title}</h1>
      <p className="mt-1 text-xs text-ash-500">Last updated {updated}</p>
      <div className="panel mt-5 rounded-3xl p-5 text-[15px] leading-relaxed text-ash-200 sm:p-6">{intro}</div>
      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-ash-300">{children}</div>
      <p className="mt-12 border-t border-ash-800 pt-4 text-xs text-ash-500">
        See also the{" "}
        <Link href="/legal/privacy/" className="font-semibold text-ash-300 underline underline-offset-2">
          privacy policy
        </Link>{" "}
        and{" "}
        <Link href="/legal/terms/" className="font-semibold text-ash-300 underline underline-offset-2">
          terms of use
        </Link>
        .
      </p>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-base font-bold text-bone sm:text-lg">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-ember-500">{children}</ul>;
}

export function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-ember-300 underline underline-offset-2">
      {children}
    </a>
  );
}
