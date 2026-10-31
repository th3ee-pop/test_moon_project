"use client";

/**
 * 观察台舞台：优先渲染 3D 月球，贴图加载完成前先用原本的 SVG 月亮顶上，
 * 贴图失败或 WebGL 不可用时永久回退到 SVG 版，学生端不会白屏。
 */

import dynamic from "next/dynamic";
import { useState } from "react";
import MoonScene from "@/components/MoonScene";
import type { MoonView } from "@/components/MoonScene3D";
import type { MoonInfo } from "@/lib/moon";

const MoonScene3D = dynamic(() => import("@/components/MoonScene3D"), {
  ssr: false,
});

export default function MoonStage({
  moon,
  showName = false,
  size = 290,
}: {
  moon: MoonInfo;
  showName?: boolean;
  size?: number;
}) {
  const [view, setView] = useState<MoonView>("earth");
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const live = ready && !failed;

  return (
    <div className="moon-stage" style={{ maxWidth: size + 120 }}>
      <div className="moon-stage-canvas">
        {!failed && (
          <MoonScene3D
            moon={moon}
            view={view}
            onReady={() => setReady(true)}
            onError={() => setFailed(true)}
          />
        )}
        {!live && (
          <div className="moon-stage-fallback">
            <MoonScene moon={moon} size={size} />
          </div>
        )}
      </div>

      {live && (
        <div className="view-switch" role="group" aria-label="观察视角">
          <button
            type="button"
            className={view === "earth" ? "on" : ""}
            aria-pressed={view === "earth"}
            onClick={() => setView("earth")}
          >
            从地球看
          </button>
          <button
            type="button"
            className={view === "space" ? "on" : ""}
            aria-pressed={view === "space"}
            onClick={() => setView("space")}
          >
            从太空看
          </button>
        </div>
      )}

      {showName && (
        <div className="scene-name">
          <span className="scene-name-dot" /> {moon.name}
        </div>
      )}

      {live && view === "space" && (
        <p className="stage-hint">
          阳光从太阳射向月球，被照亮的一半永远朝向太阳。地球在观测者这一侧，并不会挡住阳光。（天体大小与距离未按真实比例）
        </p>
      )}
    </div>
  );
}
