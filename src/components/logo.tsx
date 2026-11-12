export function FlameMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="flame-g" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#b3200c" />
          <stop offset="0.45" stopColor="#ff5a1f" />
          <stop offset="0.8" stopColor="#ffc24b" />
          <stop offset="1" stopColor="#ffe9b8" />
        </linearGradient>
      </defs>
      <path
        fill="url(#flame-g)"
        d="M16.6 1.5c.9 4.6-1.4 7-3.6 9.6-2 2.3-4.2 4.7-4.2 8.6 0 2.5 1 4.6 2.6 6-1-2.9.4-5.2 2.3-6.8-.2 2.6.9 4 2.6 4.8-.6-3.1 1.2-5.5 3.3-7.3.3 3.4 3.4 4.6 3.4 8.5 0 .3 0 .6-.1.8 1.6-1.4 2.6-3.5 2.6-5.9 0-5.4-4-8.2-5.6-12.2-.9-2.2-1.4-4-3.3-6.1Z"
      />
      <path fill="#ffe9b8" opacity=".85" d="M15.9 30.5c-2.3 0-4-1.6-4-3.8 0-2.3 2-3.3 2.9-5.5.9 1.6 2.1 1.9 2.6 3.3.4-1 .4-1.9.2-2.9 1.6 1.4 2.3 3 2.3 4.9 0 2.3-1.7 4-4 4Z" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 sm:gap-2 ${className}`}>
      <FlameMark className="h-7 w-7 animate-flicker drop-shadow-[0_0_10px_rgba(255,90,31,0.6)]" />
      <span className="font-display text-[15px] font-bold tracking-[0.1em] molten-text sm:text-lg sm:tracking-[0.18em]">INFERNO</span>
    </span>
  );
}
