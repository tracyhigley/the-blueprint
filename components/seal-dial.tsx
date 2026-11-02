"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";

// Big ceremonial seal dial. The seal/unseal transition is a 1.6-second
// sequence the user is meant to watch:
//
//   t=0      pin starts sweeping (270° clockwise to seal, counter-clockwise to open)
//   t=0      inner dotted ring counter-rotates 180°
//   t=0.4s   bolts extend outward (or retract on unseal)
//   t=0.7s   center plate gives a small scale pulse
//   t=0.9s   shackle slams down (or springs up)
//   t=1.0s   brass glow pulses
//   t=1.4s   "click" jolt — tiny rotational wobble
//   t=1.6s   settled

type Phase = "open" | "sealing" | "sealed";

const ANIM_MS = 1600;

/** Dark dial art for /sealed (ceremony); default matches app light theme. */
const DIAL_LIGHT = {
  faceA: "#faf8f4",
  faceB: "#e4dcd0",
  glowA: "rgba(201,161,74,0.28)",
  glowB: "rgba(201,161,74,0)",
  ringStroke: "#b8aa95",
  boltBorder: "#b8aa95",
  boltBg: "#e9e2d6",
  boltGlow: "rgba(201,161,74,0.22)",
  hubBg: "#f6f1ea",
  hubShadow: "rgba(201,161,74,0.28)",
  lockFill: "rgba(201,161,74,0.12)",
} as const;

const DIAL_DARK = {
  faceA: "#1f2228",
  faceB: "#0c0e11",
  glowA: "rgba(224,185,99,0.25)",
  glowB: "rgba(224,185,99,0)",
  ringStroke: "#3a322b",
  boltBorder: "#3a322b",
  boltBg: "#1a1d22",
  boltGlow: "rgba(224,185,99,0.15)",
  hubBg: "#0c0e11",
  hubShadow: "rgba(224,185,99,0.20)",
  lockFill: "rgba(224,185,99,0.08)",
} as const;

export function SealDial({
  sealed,
  animate = false,
  size = 440,
  ceremonyDark = false,
}: {
  sealed: boolean;
  animate?: boolean;
  size?: number;
  ceremonyDark?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>(
    sealed ? (animate ? "sealing" : "sealed") : animate ? "sealing" : "open",
  );
  // Force a re-render so animations trigger after first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!animate) {
      setPhase(sealed ? "sealed" : "open");
      return;
    }
    setPhase("sealing");
    const t = setTimeout(
      () => setPhase(sealed ? "sealed" : "open"),
      ANIM_MS,
    );
    return () => clearTimeout(t);
  }, [animate, sealed]);

  const isSealed = sealed && phase !== "open";
  const animating = phase === "sealing";
  const c = ceremonyDark ? DIAL_DARK : DIAL_LIGHT;
  const faceId = ceremonyDark ? "dial-face-dark" : "dial-face";
  const glowId = ceremonyDark ? "brass-glow-dark" : "brass-glow";

  // Outer ring rotation: 0 when open, 270° when sealed.
  const ringTurn = mounted && isSealed ? 270 : 0;
  // Inner ring counter-rotates for visual depth.
  const innerTurn = mounted && isSealed ? -180 : 0;
  // Final wobble overlay — tiny rotation at the end of the seal.
  const wobble = animating ? "animate-[dial-wobble_400ms_ease-out_1.2s_1]" : "";

  return (
    <div
      className="relative select-none"
      style={{ width: size, height: size }}
      aria-label={sealed ? "Sealed" : "Open"}
    >
      <style>{`
        @keyframes dial-wobble {
          0% { transform: rotate(0); }
          25% { transform: rotate(-2deg); }
          60% { transform: rotate(1deg); }
          100% { transform: rotate(0); }
        }
        @keyframes dial-glow-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        @keyframes plate-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.04); }
        }
        @keyframes shackle-slam {
          0% { transform: translateY(-3px); }
          70% { transform: translateY(1px); }
          100% { transform: translateY(0); }
        }
      `}</style>

      {/* Outer rotating layer with all the rings + pin */}
      <svg
        viewBox="0 0 440 440"
        width={size}
        height={size}
        className={clsx(
          "absolute inset-0 transition-transform duration-[1200ms] ease-[cubic-bezier(0.65,0,0.35,1)]",
          wobble,
        )}
        style={{ transform: `rotate(${ringTurn}deg)` }}
      >
        <defs>
          <radialGradient id={faceId} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor={c.faceA} />
            <stop offset="100%" stopColor={c.faceB} />
          </radialGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={c.glowA} />
            <stop offset="100%" stopColor={c.glowB} />
          </radialGradient>
        </defs>

        {/* Soft brass glow — pulses during seal */}
        <circle
          cx="220"
          cy="220"
          r="200"
          fill={`url(#${glowId})`}
          style={{
            opacity: 0.6,
            animation: animating
              ? "dial-glow-pulse 1200ms ease-out 800ms 1"
              : undefined,
            transformOrigin: "220px 220px",
          }}
        />

        {/* Dial face */}
        <circle
          cx="220"
          cy="220"
          r="180"
          fill={`url(#${faceId})`}
          stroke={c.ringStroke}
          strokeWidth="1.5"
        />

        {/* Outer track */}
        <circle
          cx="220"
          cy="220"
          r="170"
          fill="none"
          stroke="#B5853A"
          strokeWidth="1"
          opacity="0.6"
        />

        {/* Tick marks every 30° */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i * 30 * Math.PI) / 180;
          const r1 = 165;
          const r2 = 155;
          const x1 = 220 + Math.sin(angle) * r1;
          const y1 = 220 - Math.cos(angle) * r1;
          const x2 = 220 + Math.sin(angle) * r2;
          const y2 = 220 - Math.cos(angle) * r2;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#B5853A"
              strokeWidth={i % 3 === 0 ? "1.5" : "0.7"}
              opacity={i % 3 === 0 ? "0.7" : "0.3"}
            />
          );
        })}

        {/* Pin pointer */}
        <line
          x1="220"
          y1="60"
          x2="220"
          y2="100"
          stroke="#E0B963"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="220" cy="60" r="3" fill="#E0B963" />
      </svg>

      {/* Counter-rotating inner ring (independent of outer) */}
      <svg
        viewBox="0 0 440 440"
        width={size}
        height={size}
        className="absolute inset-0 transition-transform duration-[1200ms] ease-[cubic-bezier(0.65,0,0.35,1)]"
        style={{ transform: `rotate(${innerTurn}deg)` }}
      >
        <circle
          cx="220"
          cy="220"
          r="115"
          fill="none"
          stroke="#B5853A"
          strokeWidth="0.8"
          strokeDasharray="2 4"
          opacity="0.5"
        />
        {/* Inner satellite mark */}
        <circle cx="220" cy="105" r="2" fill="#E0B963" opacity="0.5" />
      </svg>

      {/* Bolts — extend outward when sealing, retract when opening */}
      {[0, 90, 180, 270].map((deg) => (
        <div
          key={deg}
          className="absolute left-1/2 top-1/2 h-[18px] w-[36px] -translate-x-1/2 rounded-sm border transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]"
          style={{
            borderColor: c.boltBorder,
            backgroundColor: c.boltBg,
            transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-${
              size / 2 - (mounted && isSealed ? 0 : 12)
            }px)`,
            transitionDelay: animating ? "400ms" : "0ms",
            boxShadow:
              isSealed && !animating ? `0 0 8px ${c.boltGlow}` : undefined,
          }}
        />
      ))}

      {/* Center plate with lock */}
      <div
        className={clsx(
          "absolute left-1/2 top-1/2 flex h-[140px] w-[140px] flex-col items-center justify-center gap-2 rounded-full border border-brass/35 transition-shadow duration-700",
          isSealed &&
            (ceremonyDark
              ? "shadow-[0_0_60px_rgba(224,185,99,0.20)]"
              : "shadow-[0_0_60px_rgba(201,161,74,0.28)]"),
        )}
        style={{
          transform: "translate(-50%, -50%)",
          backgroundColor: c.hubBg,
          animation: animating
            ? "plate-pulse 600ms ease-out 700ms 1"
            : undefined,
        }}
      >
        <div
          style={{
            animation: animating
              ? "shackle-slam 250ms ease-out 900ms 1"
              : undefined,
          }}
        >
          <LockIcon sealed={isSealed} lockFill={c.lockFill} />
        </div>
        <span
          className={clsx(
            "font-mono text-[10px] tracking-[0.32em] transition-opacity duration-500",
            isSealed ? "text-brass opacity-100" : "text-ink-mute opacity-60",
          )}
        >
          {isSealed ? "LOCKED" : "OPEN"}
        </span>
      </div>
    </div>
  );
}

function LockIcon({
  sealed,
  lockFill,
}: {
  sealed: boolean;
  lockFill: string;
}) {
  return (
    <svg width="32" height="36" viewBox="0 0 32 36" fill="none">
      {/* Shackle — slides up when open */}
      <path
        d={
          sealed
            ? "M 7 16 V 11 a 9 9 0 0 1 18 0 V 16"
            : "M 7 13 V 8 a 9 9 0 0 1 18 0 V 13"
        }
        stroke="#E0B963"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="transition-all duration-700 ease-[cubic-bezier(0.65,0,0.35,1)]"
      />
      {/* Body */}
      <rect
        x="3"
        y="16"
        width="26"
        height="18"
        rx="2"
        stroke="#E0B963"
        strokeWidth="2.5"
        fill={lockFill}
      />
      {/* Keyhole */}
      <circle cx="16" cy="23" r="2" fill="#E0B963" />
      <rect x="15" y="24" width="2" height="5" fill="#E0B963" />
    </svg>
  );
}
