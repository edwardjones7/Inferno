/** Inferno's icon set: 24px grid, 1.75 stroke, round joins. */
type P = { className?: string };
const base = (className = "h-5 w-5") => ({
  viewBox: "0 0 24 24",
  className,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconHome = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9v10.5h4.5v-6h4v6h4.5V9" />
  </svg>
);

export const IconPlay = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3.5" y="5" width="10" height="14.5" rx="2" transform="rotate(-10 8.5 12.25)" />
    <rect x="10.5" y="4.5" width="10" height="14.5" rx="2" transform="rotate(8 15.5 11.75)" />
    <path d="M15.6 9.2c-1 .9-1.9 1.6-1.9 2.6a1.3 1.3 0 0 0 2.4.6 1.3 1.3 0 0 0 2.4-.6c0-1-1-1.7-1.9-2.6l-.5-.5Z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconTrain = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.75" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

export const IconReview = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4.5v3.8h3.8" />
    <path d="M12 8v4.2l2.8 1.8" />
  </svg>
);

export const IconProfile = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="8.5" r="3.75" />
    <path d="M4.5 20c.9-3.7 3.9-5.75 7.5-5.75s6.6 2.05 7.5 5.75" />
  </svg>
);

export const IconFlame = ({ className }: P) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M12.6 2c.6 3.1-1 4.8-2.5 6.5-1.4 1.6-2.9 3.2-2.9 5.9a4.8 4.8 0 0 0 9.6 0c0-3.7-2.7-5.6-3.8-8.3-.6-1.5-.9-2.7-.4-4.1Z" />
  </svg>
);

export const IconSound = ({ className, off }: P & { off?: boolean }) => (
  <svg {...base(className)}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    {off ? <path d="m16 9.5 5 5m0-5-5 5" /> : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
  </svg>
);

export const IconSettings = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1h-.2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </svg>
);

export const IconBack = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M15 5 8 12l7 7" />
  </svg>
);

export const IconChevron = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const IconLock = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);

export const IconTrophy = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M7.5 4.5h9v5a4.5 4.5 0 0 1-9 0z" />
    <path d="M7.5 6.5H4.5a3 3 0 0 0 3 4M16.5 6.5h3a3 3 0 0 1-3 4M12 14v3.5M8.5 20h7l-.8-2.5H9.3z" />
  </svg>
);

export const IconBolt = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M13 3 5.5 13.5H12l-1 7.5 7.5-10.5H12z" />
  </svg>
);

export const IconCheck = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconX = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IconCalendar = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);

export const IconSpade = ({ className }: P) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <path d="M12 2.5C9.6 5.6 4.5 8.6 4.5 12.6a4 4 0 0 0 6.6 3.1c-.2 2.1-1 3.9-2.6 5.3h7c-1.6-1.4-2.4-3.2-2.6-5.3a4 4 0 0 0 6.6-3.1c0-4-5.1-7-7.5-10.1Z" />
  </svg>
);

export const IconStep = ({ className, dir = "next" }: P & { dir?: "next" | "prev" | "first" | "last" }) => (
  <svg {...base(className)}>
    {dir === "next" && <path d="m9 6 6 6-6 6" />}
    {dir === "prev" && <path d="m15 6-6 6 6 6" />}
    {dir === "first" && <path d="M7 6v12M17 6l-6 6 6 6" />}
    {dir === "last" && <path d="M17 6v12M7 6l6 6-6 6" />}
  </svg>
);

/** A streak freeze: a snowflake. */
export const IconFreeze = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2M4 10.5l3.4-.4L6 7M20 10.5l-3.4-.4L18 7M4 13.5l3.4.4L6 17M20 13.5l-3.4.4L18 17" />
  </svg>
);

export const IconFriends = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2" />
    <circle cx="17" cy="9" r="2.6" />
    <path d="M16.2 14.4c2.6-.3 4.4 1.3 4.9 4.3" />
  </svg>
);

export const IconCloud = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.6 4.5 4.5 0 0 0 7 18.5Z" />
  </svg>
);

export const IconCopy = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </svg>
);

export const IconSend = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 12 20 4l-4.5 16-3.8-6.7L4 12Z" />
    <path d="m11.7 13.3 3.8-3.8" />
  </svg>
);
