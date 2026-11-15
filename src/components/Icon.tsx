export function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common}>
      {name === "slides" && (
        <>
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <path d="M8 20h8M12 16v4" />
        </>
      )}
      {name === "doc" && (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        </>
      )}
      {name === "export" && (
        <>
          <path d="M12 15V4M7 8l5-5 5 5" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </>
      )}
      {name === "globe" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
        </>
      )}
      {name === "layers" && (
        <>
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5M3 17l9 5 9-5" opacity={0.55} />
        </>
      )}
      {name === "shield" && (
        <>
          <path d="M12 3l7 3v5c0 5-3 8.4-7 10-4-1.6-7-5-7-10V6z" />
          <path d="M9.5 12l2 2 3.5-4" />
        </>
      )}
      {name === "history" && (
        <>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 8v4l3 2" />
        </>
      )}
      {name === "spark" && (
        <>
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
          <path d="M18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" opacity={0.6} />
        </>
      )}
      {name === "check" && <path d="M4.5 12.5l5 5 10-11" />}
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
      {name === "arrow" && <path d="M5 12h14m-6-6l6 6-6 6" />}
      {name === "keyboard" && (
        <>
          <rect x="2.5" y="6" width="19" height="12" rx="2" />
          <path d="M7 10h.01M11 10h.01M15 10h.01M17 10h.01M7 14h10" />
        </>
      )}
    </svg>
  );
}

export type IconName =
  | "slides"
  | "doc"
  | "export"
  | "globe"
  | "layers"
  | "shield"
  | "history"
  | "spark"
  | "check"
  | "plus"
  | "arrow"
  | "keyboard";