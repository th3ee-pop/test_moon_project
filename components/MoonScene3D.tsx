"use client";

/**
 * 三维月相观察台。
 *
 * 物理模型（两个视图共用，保证切换时月相一致）：
 * - 太阳方向固定，地球在原点，月球沿轨道绕地球公转，公转角 = 2π × phase；
 * - 月球永远只有朝太阳的一半被照亮，月相是「从地球看这颗球」的视觉结果；
 * - 「从地球看」相机就在地球位置看月球，就是抬头所见；
 * - 「从太空看」相机退到系统外俯视，地球、月球、太阳与光线同框，
 *   可以直观看到「被照亮的一半始终朝向太阳」，而不是地球挡住了光。
 *
 * 月球不自转（潮汐锁定），始终以同一面朝向地球。
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { MoonInfo } from "@/lib/moon";

export type MoonView = "earth" | "space";

type SceneRef = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  apply: (phase: number, view: MoonView) => void;
  tick: () => void;
};

/** 太阳所在方向（固定），月球绕地球转到哪儿都靠它决定明暗 */
const SUN_DIR = new THREE.Vector3(-0.42, 0.1, -1).normalize();
const UP = new THREE.Vector3(0, 1, 0);
/** 轨道平面的另一条基向量。取 UP × SUN_DIR 才能让盈月亮在右侧、亏月亮在左侧（北半球所见） */
const PERP = new THREE.Vector3().crossVectors(UP, SUN_DIR).normalize();
/** 月球轨道半径 */
const ORBIT_R = 8.5;
/** 「从地球看」的视野角，配合 ORBIT_R 让月球占满大半画面 */
const EARTH_FOV = 21;
/** 太阳本体到地球的距离（太空视图里要看得见，因此远小于真实比例） */
const SUN_DIST = 14;
/**
 * 「从太空看」的机位：站在垂直于阳光的方向侧上方。
 * 这样无论月球公转到轨道的哪一点，明暗交界线都正对相机，
 * 学生看到的永远是「一半亮一半暗、亮的那半朝着太阳」，
 * 而不是随日期忽明忽暗 —— 后者会被误读成月球自己在变。
 *
 * 由于 {UP, PERP, SUN_DIR} 是一组正交基，相机方向不含 SUN_DIR 分量，
 * 太阳—地球—月球这条轴线正好横躺在画面水平方向上，构图稳定。
 */
const SPACE_AXIS = PERP.clone().multiplyScalar(0.82).addScaledVector(UP, 0.57).normalize();
/** 注视点取在「月球最远端」与「太阳」的中点，并整体抬高一点，让系统垂直居中 */
const SPACE_TARGET = SUN_DIR.clone().multiplyScalar(3.2).addScaledVector(UP, 2.2);
const SPACE_CAM = SPACE_TARGET.clone().addScaledVector(SPACE_AXIS, 30);
const SPACE_FOV = 50;

/** 太空视图里月球放大一些，否则在这个远景机位下只有一个点 */
const SPACE_MOON_SCALE = 1.35;

function moonPosition(phase: number, out: THREE.Vector3) {
  const a = 2 * Math.PI * phase;
  return out
    .copy(SUN_DIR)
    .multiplyScalar(Math.cos(a) * ORBIT_R)
    .addScaledVector(PERP, Math.sin(a) * ORBIT_R);
}

function makeGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,250,238,1)");
  g.addColorStop(0.22, "rgba(255,228,166,0.62)");
  g.addColorStop(0.55, "rgba(255,192,112,0.16)");
  g.addColorStop(1, "rgba(255,180,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function MoonScene3D({
  moon,
  view,
  onReady,
  onError,
}: {
  moon: MoonInfo;
  view: MoonView;
  onReady?: () => void;
  onError?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRef | null>(null);
  const latest = useRef({ moon, view, onReady, onError });
  latest.current = { moon, view, onReady, onError };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;
    const startAt = performance.now();

    let renderer: THREE.WebGLRenderer;
    // 先探测 WebGL，避免在不支持的设备上徒劳创建上下文并往控制台抛错
    let probe: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try {
      const canvas = document.createElement("canvas");
      probe = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    } catch {
      probe = null;
    }
    if (!probe) {
      latest.current.onError?.();
      return;
    }
    probe.getExtension("WEBGL_lose_context")?.loseContext();

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        // 按需渲染时保留缓冲，否则合成器可能拿到空帧
        preserveDrawingBuffer: true,
      });
    } catch {
      latest.current.onError?.();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 320, host.clientHeight || 320, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      EARTH_FOV,
      (host.clientWidth || 320) / (host.clientHeight || 320),
      0.1,
      400,
    );
    camera.position.set(0, 0, 0);
    camera.lookAt(SUN_DIR.clone().multiplyScalar(ORBIT_R));

    const loader = new THREE.TextureLoader();
    const loadTex = (url: string) =>
      new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            resolve(tex);
          },
          undefined,
          () => reject(new Error(`贴图加载失败：${url}`)),
        );
      });

    (async () => {
      let moonTex: THREE.Texture;
      let starsTex: THREE.Texture;
      let earthTex: THREE.Texture;
      try {
        [moonTex, starsTex, earthTex] = await Promise.all([
          loadTex("/textures/moon.webp"),
          loadTex("/textures/stars.webp"),
          loadTex("/textures/earth.webp"),
        ]);
      } catch {
        if (!cancelled) latest.current.onError?.();
        return;
      }
      if (cancelled) return;

      // 银河星空：大球内壁，比散点更接近真实天幕
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(120, 48, 32),
        new THREE.MeshBasicMaterial({ map: starsTex, side: THREE.BackSide }),
      );
      scene.add(sky);

      // 地球
      const earth = new THREE.Mesh(
        new THREE.SphereGeometry(2.3, 64, 48),
        new THREE.MeshStandardMaterial({
          map: earthTex,
          emissive: 0xffffff,
          emissiveMap: earthTex,
          emissiveIntensity: 0.14,
          roughness: 1,
          metalness: 0,
        }),
      );
      scene.add(earth);

      // 月球本体
      const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 64),
        new THREE.MeshStandardMaterial({
          map: moonTex,
          bumpMap: moonTex,
          bumpScale: 0.02,
          roughness: 1,
          metalness: 0,
          // 极弱自发光 = 地球反照（earthshine）：新月时月面不至于完全一片死黑，
          // 学生仍能看出「月亮就在那儿，只是没被照亮」
          emissive: 0xffffff,
          emissiveMap: moonTex,
          emissiveIntensity: 0.014,
        }),
      );
      // 贴图中心（0° 经度）在 SphereGeometry 上映射到 +X，绕 Y 轴 -90° 才转到正对镜头，
      // 也就是潮汐锁定下地球始终看到的那一面（有大片月海的正面）
      moonMesh.rotation.y = -Math.PI / 2;
      scene.add(moonMesh);

      // 太阳光：唯一主光源
      const sunLight = new THREE.DirectionalLight(0xfff4e2, 3.6);
      scene.add(sunLight);
      scene.add(sunLight.target);

      // 极弱环境光：只让暗部保留一点点轮廓，绝不能把月相冲淡
      scene.add(new THREE.AmbientLight(0x27304d, 0.3));

      // 太阳本体：太空视图里必须是画面中看得见的一颗，学生才能建立「光从哪来」
      const sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.3, 48, 32),
        new THREE.MeshBasicMaterial({ color: 0xfff3d4 }),
      );
      sunMesh.position.copy(SUN_DIR).multiplyScalar(SUN_DIST);
      scene.add(sunMesh);

      // 太阳外层的辉光（远景亮点）
      const glow = makeGlowTexture();
      const sunSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glow ?? undefined,
          color: 0xffe9b8,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      sunSprite.scale.setScalar(9);
      sunSprite.position.copy(sunMesh.position);
      scene.add(sunSprite);

      // 平行光线束：把「光从哪边来」画出来
      const rays = new THREE.Group();
      const rayMaterial = new THREE.LineBasicMaterial({
        color: 0xffe2a0,
        transparent: true,
        opacity: 0.42,
      });
      for (let i = -2; i <= 2; i += 1) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, 0),
        ]);
        rays.add(new THREE.Line(geo, rayMaterial));
      }
      scene.add(rays);

      const moonPos = new THREE.Vector3();

      const apply = (phase: number, mode: MoonView) => {
        moonPosition(phase, moonPos);
        moonMesh.position.copy(moonPos);
        // 潮汐锁定：无论公转到哪儿，正面始终朝着地球
        moonMesh.rotation.y = Math.atan2(moonPos.z, -moonPos.x);

        // 阳光平行射向月球，太阳本体放在同一方向上更远处
        sunLight.position.copy(moonPos).addScaledVector(SUN_DIR, 12);
        sunLight.target.position.copy(moonPos);

        earth.position.set(0, 0, 0);

        const space = mode === "space";
        sunMesh.visible = space;
        sunSprite.visible = space;
        rays.visible = space;
        earth.visible = space;
        moonMesh.scale.setScalar(space ? SPACE_MOON_SCALE : 1);

        if (space) {
          // 光束从太阳表面发散、收敛到月球受光面：一看就知道光是从太阳来的。
          // （真实阳光是平行的，但把线画到太阳上，小学生更容易读）
          const baseDist = 1.5 * SPACE_MOON_SCALE;
          const sunFace = SUN_DIR.clone().multiplyScalar(SUN_DIST - 2.5);
          rays.children.forEach((line, idx) => {
            const offset = (idx - 2) * 0.62;
            const base = moonPos.clone().addScaledVector(SUN_DIR, baseDist).addScaledVector(UP, offset);
            const tip = sunFace.clone().addScaledVector(UP, offset * 0.28);
            const pos = (line as THREE.Line).geometry.attributes.position as THREE.BufferAttribute;
            pos.setXYZ(0, base.x, base.y, base.z);
            pos.setXYZ(1, tip.x, tip.y, tip.z);
            pos.needsUpdate = true;
            (line as THREE.Line).geometry.computeBoundingSphere();
          });
        }

        if (space) {
          camera.position.copy(SPACE_CAM);
          camera.fov = SPACE_FOV;
          camera.lookAt(SPACE_TARGET);
        } else {
          // 观测者站在地球上：相机就是地球的位置，抬头看月球
          camera.position.set(0, 0, 0);
          camera.fov = EARTH_FOV;
          camera.lookAt(moonPos);
        }
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      };

      const tick = () => {
        if (latest.current.view === "space") {
          // 极缓慢的视角漂移，让画面是「活的」，幅度小到不干扰观察
          const t = (performance.now() - startAt) / 1000;
          camera.position.set(
            SPACE_CAM.x + Math.sin(t * 0.14) * 0.5,
            SPACE_CAM.y + Math.cos(t * 0.11) * 0.35,
            SPACE_CAM.z + Math.cos(t * 0.14) * 0.45,
          );
          camera.lookAt(SPACE_TARGET);
          renderer.render(scene, camera);
        }
        raf = requestAnimationFrame(tick);
      };

      sceneRef.current = { renderer, scene, camera, apply, tick };
      apply(latest.current.moon.phase, latest.current.view);
      raf = requestAnimationFrame(tick);
      latest.current.onReady?.();

      const handleResize = () => {
        const w = host.clientWidth || 320;
        const h = host.clientHeight || 320;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      };
      handleResize();
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(host);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      const state = sceneRef.current;
      if (state) {
        state.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose();
        });
      }
      sceneRef.current = null;
      // 即便场景没初始化完成也必须回收，否则 StrictMode 双挂载会残留
      // 一个空 canvas 并占着 WebGL 上下文，导致后续画面空白
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // phase / view 变化时只重画，不重建场景
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;
    state.apply(moon.phase, view);
  }, [moon.phase, view]);

  return <div ref={hostRef} className="scene3d" aria-hidden="true" />;
}
