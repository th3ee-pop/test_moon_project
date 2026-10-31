"use client";

import { useId } from "react";
import { litPath, type MoonInfo } from "@/lib/moon";

const R = 92;

/** 确定性星点：整数 LCG，保证服务端与客户端算出完全相同的坐标 */
const STARS = (() => {
  let seed = 20260401;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return Array.from({ length: 46 }, () => ({
    x: Math.round((next() * 400 - 200) * 100) / 100,
    y: Math.round((next() * 400 - 200) * 100) / 100,
    r: Math.round((0.6 + next() * 1.5) * 100) / 100,
    o: Math.round((0.25 + next() * 0.6) * 100) / 100,
  }));
})();

export default function MoonScene({
  moon,
  showName = false,
  size = 300,
}: {
  moon: MoonInfo;
  showName?: boolean;
  size?: number;
}) {
  const uid = useId().replace(/[:]/g, "");
  const lit = litPath(moon.phase, R);

  return (
    <div className="scene" style={{ width: "100%", maxWidth: size + 140 }}>
      <svg viewBox="-200 -200 400 400" className="scene-svg" role="img" aria-label={`月相：${showName ? moon.name : "待观察"}`}>
        <defs>
          <radialGradient id={`glow${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="#ffe9b8" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#ffe9b8" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`lit${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fffaf0" />
            <stop offset="60%" stopColor="#f6e2b3" />
            <stop offset="100%" stopColor="#e8c98d" />
          </linearGradient>
          <radialGradient id={`dark${uid}`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#2b3350" />
            <stop offset="100%" stopColor="#151a2c" />
          </radialGradient>
          <clipPath id={`clip${uid}`}>
            <path d={lit} />
          </clipPath>
        </defs>

        <circle cx="0" cy="0" r={R + 62} fill={`url(#glow${uid})`} />

        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#dbe4ff" opacity={s.o} />
        ))}

        <circle cx="0" cy="0" r={R} fill={`url(#dark${uid})`} stroke="#3a436a" strokeWidth="0.8" />
        <path d={lit} fill={`url(#lit${uid})`} />
        <g clipPath={`url(#clip${uid})`} opacity="0.16">
          <circle cx={-28} cy={-22} r={17} fill="#8a7448" />
          <circle cx={18} cy={12} r={24} fill="#8a7448" />
          <circle cx={-8} cy={38} r={11} fill="#8a7448" />
          <circle cx={34} cy={-38} r={9} fill="#8a7448" />
          <circle cx={-44} cy={16} r={7} fill="#8a7448" />
        </g>
      </svg>

      {showName && (
        <div className="scene-name">
          <span className="scene-name-dot" /> {moon.name}
        </div>
      )}
    </div>
  );
}
