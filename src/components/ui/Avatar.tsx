import { cn } from "@/lib/utils/cn";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  /** Deterministic seed — pass the user id (or `avatar_seed`), never random. */
  seed: string;
  size?: AvatarSize;
  /** 0–1 progress ring around the avatar, for the profile level indicator. */
  levelRingProgress?: number;
  className?: string;
}

const sizes: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 88 };

const PALETTE = [
  "var(--color-moss)",
  "var(--color-gold)",
  "var(--color-clay)",
  "var(--color-plum)",
  "var(--color-moss-glow)",
  "var(--color-gold-soft)",
] as const;

/** FNV-1a — small, fast, deterministic. Not cryptographic; that's not the point here. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Builds a symmetric 5x5 identicon-style cell grid from the seed hash. */
function buildCells(hash: number): boolean[][] {
  const cols = 5;
  const rows = 5;
  const half = Math.ceil(cols / 2);
  const grid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  let bits = hash;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < half; c++) {
      const on = (bits & 1) === 1;
      bits >>>= 1;
      if (bits === 0) bits = hashSeed(`${hash}:${r}:${c}`);
      grid[r]![c] = on;
      grid[r]![cols - 1 - c] = on;
    }
  }
  return grid;
}

/**
 * Deterministic generative avatar — no external avatar service, no
 * randomness at render time. Same seed always produces the same image.
 */
export function Avatar({ seed, size = "md", levelRingProgress, className }: AvatarProps) {
  const px = sizes[size];
  const hash = hashSeed(seed || "aspiquiz");
  const bg = PALETTE[hash % PALETTE.length];
  const fg = PALETTE[(hash >>> 8) % PALETTE.length];
  const cells = buildCells(hash);
  const cell = 5;
  const ringRadius = px / 2 - 2;
  const circumference = 2 * Math.PI * ringRadius;
  const dash = Math.max(0, Math.min(1, levelRingProgress ?? 0)) * circumference;

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: px, height: px }}
    >
      <svg
        viewBox="0 0 25 25"
        width={px}
        height={px}
        role="img"
        aria-label="Avatar"
        className="rounded-[30%]"
      >
        <rect width="25" height="25" fill={bg} opacity="0.35" />
        {cells.map((row, r) =>
          row.map(
            (on, c) =>
              on && (
                <rect
                  key={`${r}-${c}`}
                  x={c * cell}
                  y={r * cell}
                  width={cell}
                  height={cell}
                  fill={fg}
                />
              ),
          ),
        )}
      </svg>
      {levelRingProgress !== undefined && (
        <svg
          aria-hidden="true"
          width={px}
          height={px}
          className="pointer-events-none absolute inset-0 -rotate-90"
        >
          <circle
            cx={px / 2}
            cy={px / 2}
            r={ringRadius}
            fill="none"
            stroke="var(--color-border-soft)"
            strokeWidth="2"
          />
          <circle
            cx={px / 2}
            cy={px / 2}
            r={ringRadius}
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
      )}
    </span>
  );
}
