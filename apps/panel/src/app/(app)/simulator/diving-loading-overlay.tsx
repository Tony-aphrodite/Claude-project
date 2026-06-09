"use client";

// ─── Diving-themed loading overlay ────────────────────────────────────────
//
// Miguel rule 2026-06-09 PM: "el sitio está relacionado con buceo, así que
// el loading tiene que ser tematico — no spinner genérico". Fullscreen
// blur + centered diving mask + rising bubbles, shown whenever the
// simulator is waiting on the network (AI inference, OCR upload, grid
// edit, rewind, etc).
//
// Pure CSS keyframes, no animation libs — bubbles rise with offset
// timings, the mask gently bobs to mimic floating. Bright cyan glow keys
// off the brand palette so it reads as "DPM" not generic web overlay.

import { useEffect, useState } from "react";

type Props = {
  visible: boolean;
  /** Short label shown beneath the mask. Defaults to "Procesando…". */
  label?: string;
};

const KEYFRAMES = `
  @keyframes dpm-bubble-rise {
    0%   { transform: translateY(0px) scale(0.55); opacity: 0; }
    20%  { opacity: 0.85; }
    100% { transform: translateY(-90px) scale(1.05); opacity: 0; }
  }
  @keyframes dpm-mask-float {
    0%, 100% { transform: translateY(0px) rotate(-3deg); }
    50%      { transform: translateY(-10px) rotate(3deg); }
  }
  @keyframes dpm-label-pulse {
    0%, 100% { opacity: 0.65; }
    50%      { opacity: 1; }
  }
`;

const BUBBLES: Array<{ left: number; size: number; delay: number; duration: number }> = [
  { left: -32, size: 6, delay: 0, duration: 2.4 },
  { left: -10, size: 10, delay: 0.5, duration: 2.0 },
  { left: 14, size: 7, delay: 1.0, duration: 2.6 },
  { left: 34, size: 5, delay: 1.4, duration: 2.2 },
  { left: -22, size: 4, delay: 1.8, duration: 1.8 },
];

export function DivingLoadingOverlay({ visible, label }: Props) {
  // Delay rendering a tick so a fast operation (<150ms) never flashes.
  // Operators perceive the overlay as a real signal of meaningful wait.
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!visible) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), 150);
    return () => clearTimeout(t);
  }, [visible]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto"
      role="status"
      aria-live="polite"
      aria-label={label ?? "Procesando"}
    >
      <style>{KEYFRAMES}</style>
      <div className="flex flex-col items-center gap-5">
        {/* Mask + bubbles stack */}
        <div className="relative w-32 h-36">
          {/* Bubbles rise from below the mask */}
          {BUBBLES.map((b, i) => (
            <span
              key={i}
              className="absolute block rounded-full bg-cyan-300/90 shadow-[0_0_8px_rgba(103,232,249,0.7)]"
              style={{
                left: `calc(50% + ${b.left}px)`,
                bottom: "12px",
                width: b.size,
                height: b.size,
                animation: `dpm-bubble-rise ${b.duration}s ease-out ${b.delay}s infinite`,
              }}
            />
          ))}

          {/* Diving mask — SVG (no dependency on emoji font availability) */}
          <svg
            viewBox="0 0 120 90"
            className="absolute bottom-0 left-1/2 -translate-x-1/2 text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.55)]"
            width="120"
            height="90"
            style={{ animation: "dpm-mask-float 2.4s ease-in-out infinite" }}
          >
            {/* Strap */}
            <path
              d="M8 35 Q60 22 112 35"
              stroke="currentColor"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
            {/* Mask body */}
            <path
              d="M14 42 Q14 28 60 28 Q106 28 106 42 L100 66 Q60 78 20 66 Z"
              fill="currentColor"
              fillOpacity="0.18"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            {/* Bridge */}
            <path
              d="M55 50 Q60 48 65 50"
              stroke="currentColor"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            {/* Lenses */}
            <ellipse
              cx="38"
              cy="48"
              rx="14"
              ry="10"
              fill="currentColor"
              fillOpacity="0.45"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <ellipse
              cx="82"
              cy="48"
              rx="14"
              ry="10"
              fill="currentColor"
              fillOpacity="0.45"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            {/* Lens reflection highlights */}
            <ellipse cx="33" cy="44" rx="4" ry="2.5" fill="white" fillOpacity="0.65" />
            <ellipse cx="77" cy="44" rx="4" ry="2.5" fill="white" fillOpacity="0.65" />
          </svg>
        </div>

        {/* Label chip */}
        <div
          className="px-5 py-1.5 rounded-full bg-ink-100/95 ring-1 ring-cyan-400/40 text-sm font-semibold text-cyan-100 tracking-wide shadow-card"
          style={{ animation: "dpm-label-pulse 1.6s ease-in-out infinite" }}
        >
          {label ?? "Procesando…"}
        </div>
      </div>
    </div>
  );
}
