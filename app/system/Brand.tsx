"use client";

/* ==========================================================================
   TOMAS TECH brand mark

   Drawn as inline SVG so it stays sharp at every size, follows the surface it
   sits on (the sidebar and the login panel are dark, everything else is light)
   and costs no extra request. Brand colours: deep blue, sky blue, gold spark.
   ========================================================================== */

export type BrandTone = "light" | "dark";

const COLOURS = {
  light: { globe: "#0B57A4", swoosh: "#0B57A4", swooshAlt: "#189BE0", spark: "#FFC20E", word: "#0B57A4" },
  dark: { globe: "#ffffff", swoosh: "#4FA9EC", swooshAlt: "#8FD1F7", spark: "#FFC20E", word: "#ffffff" },
} as const;

export function BrandMark({ size = 32, tone = "light", className }: { size?: number; tone?: BrandTone; className?: string }) {
  const c = COLOURS[tone];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      role="img"
      aria-label="TOMAS TECH"
    >
      <defs>
        <clipPath id="tt-globe">
          <circle cx="58" cy="44" r="26" />
        </clipPath>
        {/* The orbit ribbon runs in front of the globe, leaving a clean gap. */}
        <mask id="tt-orbit-cut">
          <rect width="128" height="128" fill="#fff" />
          <path d="M4 80C32 82 76 62 124 26 78 72 34 90 4 80Z" fill="#000" stroke="#000" strokeWidth="7" strokeLinejoin="round" />
        </mask>
      </defs>

      {/* Wireframe globe */}
      <g mask="url(#tt-orbit-cut)">
        <g clipPath="url(#tt-globe)" stroke={c.globe} strokeWidth="4.2" fill="none">
          <circle cx="58" cy="44" r="24" />
          <ellipse cx="58" cy="44" rx="8.5" ry="24" />
          <ellipse cx="58" cy="44" rx="17" ry="24" />
          <line x1="58" y1="19" x2="58" y2="69" />
          <line x1="33" y1="32" x2="83" y2="32" />
          <line x1="33" y1="44" x2="83" y2="44" />
          <line x1="33" y1="56" x2="83" y2="56" />
        </g>
      </g>

      {/* Orbit ribbons, tapering to a point at each end */}
      <path d="M4 80C32 82 76 62 124 26 78 72 34 90 4 80Z" fill={c.swoosh} />
      <path d="M22 96C44 96 74 80 106 56 72 88 44 102 22 96Z" fill={c.swooshAlt} />
      <path d="M40 112C52 108 66 98 78 86 68 104 56 114 44 120Z" fill={c.swooshAlt} opacity="0.75" />

      {/* Gold spark */}
      <path d="M100 12 103.6 23.4 115 27 103.6 30.6 100 42 96.4 30.6 85 27 96.4 23.4Z" fill={c.spark} />
    </svg>
  );
}

/** Mark plus the TOMAS TECH wordmark, for the login panel and print headers. */
export function BrandLockup({ tone = "light", height = 40 }: { tone?: BrandTone; height?: number }) {
  const c = COLOURS[tone];
  return (
    <span className="brand-lockup" style={{ height }}>
      <BrandMark size={height} tone={tone} />
      <span className="brand-word" style={{ color: c.word, fontSize: height * 0.52 }}>
        TOMAS TECH
      </span>
    </span>
  );
}
