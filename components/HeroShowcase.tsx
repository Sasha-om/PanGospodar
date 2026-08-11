/**
 * Hero composite: the three main tool groups as premium two-tone badges.
 *
 * Sits on top of the storefront photo, so the cards are glass rather than
 * solid white — three opaque panels would cover the shop front and the STIHL
 * sign, which is the whole point of the photo. Main strokes are white for
 * contrast on the darkened image; accent details stay brand orange.
 */

const mainStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const accentStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ChainsawArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g {...mainStroke} className="text-white">
        {/* engine body */}
        <rect x="3" y="11" width="13" height="11" rx="3" />
        {/* top carry handle */}
        <path d="M6.5 11V9a2.5 2.5 0 0 1 2.5-2.5h2A2.5 2.5 0 0 1 13.5 9v2" />
        {/* guide bar */}
        <path d="M16 14h11a2.5 2.5 0 0 1 0 5H16" />
        {/* rear grip */}
        <path d="M3 16.5H2" />
      </g>
      <g {...accentStroke} className="text-accent-400">
        {/* chain teeth along the bar */}
        <path d="M18.5 13.2v-1.4M22 13.2v-1.4M25.5 13.2v-1.4" />
        {/* cooling fins */}
        <path d="M7 14.5v4M10.5 14.5v4" />
      </g>
    </svg>
  );
}

function LawnmowerArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g {...mainStroke} className="text-white">
        {/* deck */}
        <path d="M5 22v-6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6" />
        {/* grass box */}
        <path d="M19 22v-5a2 2 0 0 1 2-2h4l3 7Z" />
        {/* handle */}
        <path d="M8 13 17 5h5" />
        {/* wheels */}
        <circle cx="9" cy="24.5" r="2.5" />
        <circle cx="18" cy="24.5" r="2.5" />
      </g>
      <g {...accentStroke} className="text-accent-400">
        {/* grass tufts under the deck */}
        <path d="M13 24.5v2M13.5 24.8l1.5 1.4M12.5 24.8 11 26.2" />
      </g>
    </svg>
  );
}

function DrillArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g {...mainStroke} className="text-white">
        {/* motor housing */}
        <path d="M7 9h11a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H7Z" />
        {/* rear cap */}
        <path d="M7 9a5.5 5.5 0 0 0 0 11" />
        {/* chuck */}
        <rect x="21" y="11.5" width="4" height="6" rx="1" />
        {/* grip */}
        <path d="M10 20v5a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3v-5" />
      </g>
      <g {...accentStroke} className="text-accent-400">
        {/* drill bit */}
        <path d="M25 14.5h5" />
        <path d="M26.5 13.2v2.6M28.5 13.2v2.6" />
        {/* trigger */}
        <path d="M10.5 22.5h2.5" />
      </g>
    </svg>
  );
}

const showcaseItems = [
  { label: "Бензопили", Art: ChainsawArt },
  { label: "Садова техніка", Art: LawnmowerArt },
  { label: "Електроінструмент", Art: DrillArt },
];

export default function HeroShowcase() {
  return (
    <div className="grid gap-2.5" aria-hidden="true">
      {showcaseItems.map(({ label, Art }, index) => (
        <div
          key={label}
          className={`flex items-center gap-4 rounded-sm border border-white/20 bg-white/10 p-3.5 backdrop-blur-md ${
            index === 1 ? "lg:translate-x-6" : ""
          }`}
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/15">
            <Art className="h-8 w-8" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white">{label}</div>
            <div className="mt-1 h-1 w-14 rounded-full bg-accent-400" />
          </div>
        </div>
      ))}
    </div>
  );
}
