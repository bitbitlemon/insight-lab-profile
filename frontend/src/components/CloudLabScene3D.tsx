import { useEffect, useMemo, useRef } from "react";
import type { PointerEvent } from "react";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import "@babylonjs/core/Rendering/edgesRenderer";
import "@babylonjs/core/Rendering/outlineRenderer";
import { Scene } from "@babylonjs/core/scene";
import type { LabChatCluster, LabOccupancy, LabSpace } from "../api/lab";
import type { Member, Task } from "../types/api";

interface CloudLabScene3DProps {
  spaces: LabSpace[];
  occupancy: LabOccupancy[];
  members: Member[];
  activeSceneId: "all" | number;
  onSelectSpace: (spaceId: "all" | number) => void;
  clusters?: LabChatCluster[];
  mode?: "orbit" | "walk";
  quality?: "auto" | "low" | "high";
  onSelectMember?: (openId: string) => void;
  onSelectChat?: (clusterId: string) => void;
  tasks?: Task[];
  onSelectTask?: (taskId: number) => void;
  onFps?: (fps: number) => void;
}

type JoystickState = {
  active: boolean;
  pointerId: number | null;
  x: number;
  y: number;
};

type SceneMaterials = {
  floor: StandardMaterial;
  white: StandardMaterial;
  softWhite: StandardMaterial;
  leg: StandardMaterial;
  monitor: StandardMaterial;
  glass: PBRMaterial;
  glassFrame: StandardMaterial;
  wall: StandardMaterial;
  label: StandardMaterial;
  labelText: StandardMaterial;
  line: StandardMaterial;
  brand: StandardMaterial;
  platform: StandardMaterial;
  platformEdge: StandardMaterial;
};

const zoneTints = ["#EAF4FF", "#EDF9F1", "#FFF8E8", "#F4F6FF", "#EEF7F7", "#F7F7F9"];
const brandBlue = "#3B82F6";
const mutedBlue = "#BFD8FF";
const mutedGreen = "#CBEBD8";
const mutedYellow = "#F4E2AE";
const mutedRed = "#F3C8C8";
const groundHex = "#ECEFF3";
const wallHex = "#F2F3F5";
const whiteHex = "#FFFFFF";
const platformHex = "#F3F5F8";
const platformEdgeHex = "#DDE3EA";
const lineHex = "#C9D1DA";

const statusColor: Record<string, string> = {
  present: "#8BBDF8",
  working: "#9ADBB0",
  meeting: "#B6B5F2",
  class: "#E8CD8D",
  away: "#C8CED8",
  leave: "#EFB3B3",
  offline: "#D6D9DE",
  reserved: "#9FD7E5",
};

const priorityColor: Record<string, string> = {
  low: "#C8CED8",
  medium: mutedBlue,
  high: mutedYellow,
  urgent: mutedRed,
};

const taskStatusColor: Record<string, string> = {
  todo: "#D8E9FF",
  in_progress: "#FFF1CC",
  blocked: "#F8D7D7",
  done: "#DDF3E5",
  cancelled: "#E5E7EB",
};

const makeMat = (scene: Scene, name: string, hex: string, options?: { alpha?: number; specular?: string; emissive?: number }) => {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.FromHexString(hex);
  mat.specularColor = Color3.FromHexString(options?.specular || "#F7F8FA");
  mat.emissiveColor = Color3.FromHexString(hex).scale(options?.emissive ?? 0.03);
  mat.alpha = options?.alpha ?? 1;
  return mat;
};

const createMaterials = (scene: Scene): SceneMaterials => {
  const floor = new StandardMaterial("enterprise-floor", scene);
  floor.diffuseColor = Color3.FromHexString(groundHex);
  floor.specularColor = Color3.FromHexString("#FFFFFF");
  floor.emissiveColor = Color3.FromHexString(groundHex).scale(0.018);

  const glass = new PBRMaterial("enterprise-glass", scene);
  glass.albedoColor = Color3.FromHexString("#F8FBFE");
  glass.alpha = 0.55;
  glass.metallic = 0.08;
  glass.roughness = 0.08;
  glass.indexOfRefraction = 1.45;
  glass.microSurface = 0.92;
  glass.reflectivityColor = Color3.FromHexString("#E4EBF2");
  glass.emissiveColor = Color3.FromHexString("#EEF3F7").scale(0.04);

  return {
    floor,
    white: makeMat(scene, "enterprise-white", whiteHex, { emissive: 0.02 }),
    softWhite: makeMat(scene, "enterprise-soft-white", "#FAFBFC", { emissive: 0.02 }),
    leg: makeMat(scene, "enterprise-light-metal", "#D8DDE5", { specular: "#FFFFFF", emissive: 0.016 }),
    monitor: makeMat(scene, "enterprise-monitor", "#2F3742", { specular: "#596273" }),
    glass,
    glassFrame: makeMat(scene, "enterprise-glass-frame", "#D7DEE6", { emissive: 0.018 }),
    wall: makeMat(scene, "enterprise-wall", wallHex, { emissive: 0.018 }),
    label: makeMat(scene, "enterprise-label", "#FFFFFF", { emissive: 0.06 }),
    labelText: makeMat(scene, "enterprise-label-text", "#FFFFFF", { emissive: 0.12 }),
    line: makeMat(scene, "enterprise-line", lineHex, { emissive: 0.016 }),
    brand: makeMat(scene, "enterprise-brand", brandBlue),
    platform: makeMat(scene, "enterprise-platform", platformHex, { emissive: 0.024 }),
    platformEdge: makeMat(scene, "enterprise-platform-edge", platformEdgeHex, { emissive: 0.02 }),
  };
};

const makeTint = (scene: Scene, hex: string, alpha = 0.05) => {
  const mat = new StandardMaterial(`zone-tint-${hex}`, scene);
  mat.diffuseColor = Color3.FromHexString(hex);
  mat.specularColor = Color3.White();
  mat.alpha = alpha;
  return mat;
};

const createTextTexture = (
  scene: Scene,
  name: string,
  text: string,
  options?: { width?: number; height?: number; font?: string; color?: string; background?: string },
) => {
  const width = options?.width || 512;
  const height = options?.height || 160;
  const texture = new DynamicTexture(name, { width, height }, scene, false);
  texture.hasAlpha = true;
  const context = texture.getContext();
  context.clearRect(0, 0, width, height);
  texture.drawText(
    text.slice(0, 28),
    null,
    Math.round(height * 0.62),
    options?.font || `600 ${Math.round(height * 0.28)}px Inter, Arial`,
    options?.color || "#2B2F36",
    options?.background || "transparent",
    true,
  );
  return texture;
};

const createLabel = (scene: Scene, text: string, position: Vector3, width = 2.2) => {
  const card = MeshBuilder.CreateBox(`label-card-${text}`, { width, height: 0.04, depth: 0.42 }, scene);
  card.position = position;
  card.material = makeMat(scene, `label-card-mat-${text}`, "#FFFFFF", { emissive: 0.08 });
  card.receiveShadows = true;

  const plane = MeshBuilder.CreatePlane(`label-text-${text}`, { width: width * 0.9, height: 0.28 }, scene);
  plane.position = new Vector3(position.x, position.y + 0.024, position.z);
  plane.rotation.x = Math.PI / 2;
  const texture = createTextTexture(scene, `label-texture-${text}`, text, { color: "#2B2F36" });
  const mat = new StandardMaterial(`label-text-mat-${text}`, scene);
  mat.diffuseTexture = texture;
  mat.opacityTexture = texture;
  mat.emissiveColor = Color3.White();
  mat.backFaceCulling = false;
  plane.material = mat;
  plane.isPickable = false;
  card.metadata = { ...(card.metadata || {}), lodLabelCard: card, lodLabelPlane: plane };
  return card;
};

const createPlatform = (
  scene: Scene,
  name: string,
  position: Vector3,
  size: { width: number; depth: number },
  materials: SceneMaterials,
) => {
  const top = createBox(scene, `${name}-top`, new Vector3(position.x, position.y + 0.022, position.z), { width: size.width, height: 0.045, depth: size.depth }, materials.platform);
  const skirt = createBox(scene, `${name}-skirt`, new Vector3(position.x, position.y - 0.004, position.z), { width: size.width, height: 0.022, depth: size.depth }, materials.platformEdge);
  [
    new Vector3(position.x, position.y + 0.041, position.z + size.depth / 2),
    new Vector3(position.x, position.y + 0.041, position.z - size.depth / 2),
  ].forEach((edgePos, index) => {
    createBox(scene, `${name}-edge-z-${index}`, edgePos, { width: size.width + 0.04, height: 0.012, depth: 0.03 }, materials.line);
  });
  [
    new Vector3(position.x + size.width / 2, position.y + 0.041, position.z),
    new Vector3(position.x - size.width / 2, position.y + 0.041, position.z),
  ].forEach((edgePos, index) => {
    createBox(scene, `${name}-edge-x-${index}`, edgePos, { width: 0.03, height: 0.012, depth: size.depth + 0.04 }, materials.line);
  });
  top.metadata = { ...(top.metadata || {}), lodPlatform: true };
  skirt.metadata = { ...(skirt.metadata || {}), lodPlatform: true };
  return top;
};

const createBox = (
  scene: Scene,
  name: string,
  position: Vector3,
  size: { width: number; height: number; depth: number },
  material: Material,
  shadow?: ShadowGenerator,
) => {
  const box = MeshBuilder.CreateBox(name, size, scene);
  box.position = position;
  box.material = material;
  box.receiveShadows = true;
  box.checkCollisions = true;
  if (shadow) shadow.addShadowCaster(box);
  return box;
};

const createCylinder = (
  scene: Scene,
  name: string,
  position: Vector3,
  diameter: number,
  height: number,
  material: Material,
  shadow?: ShadowGenerator,
) => {
  const cylinder = MeshBuilder.CreateCylinder(name, { diameter, height, tessellation: 20 }, scene);
  cylinder.position = position;
  cylinder.material = material;
  cylinder.receiveShadows = true;
  cylinder.checkCollisions = true;
  if (shadow) shadow.addShadowCaster(cylinder);
  return cylinder;
};

const createContactShadow = (scene: Scene, name: string, x: number, z: number, width: number, depth: number, alpha = 0.08) => {
  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.diffuseColor = Color3.FromHexString("#6B7280");
  mat.specularColor = Color3.Black();
  mat.alpha = alpha;
  const shadow = MeshBuilder.CreatePlane(name, { width, height: depth }, scene);
  shadow.position = new Vector3(x, 0.012, z);
  shadow.rotation.x = Math.PI / 2;
  shadow.material = mat;
  shadow.isPickable = false;
  return shadow;
};

const addSoftOutline = (mesh: Mesh, width = 0.012, color = "#C5CED8") => {
  mesh.renderOutline = true;
  mesh.outlineWidth = width;
  mesh.outlineColor = Color3.FromHexString(color);
  return mesh;
};

const createDesk = (
  scene: Scene,
  name: string,
  x: number,
  z: number,
  materials: SceneMaterials,
  metadata: Record<string, unknown>,
  shadow?: ShadowGenerator,
) => {
  createContactShadow(scene, `${name}-soft-shadow`, x, z + 0.08, 1.22, 0.92, 0.055);
  const top = addSoftOutline(createBox(scene, `${name}-top`, new Vector3(x, 0.54, z), { width: 1.08, height: 0.035, depth: 0.64 }, materials.white, shadow), 0.008);
  top.metadata = metadata;
  [
    [-0.44, -0.25],
    [0.44, -0.25],
    [-0.44, 0.25],
    [0.44, 0.25],
  ].forEach(([lx, lz], index) => {
    const leg = createCylinder(scene, `${name}-leg-${index}`, new Vector3(x + lx, 0.28, z + lz), 0.035, 0.5, materials.leg, shadow);
    leg.metadata = metadata;
  });

  const chairSeat = addSoftOutline(createBox(scene, `${name}-chair-seat`, new Vector3(x, 0.3, z + 0.58), { width: 0.42, height: 0.055, depth: 0.38 }, materials.softWhite, shadow), 0.006);
  chairSeat.metadata = metadata;
  const chairBase = createCylinder(scene, `${name}-chair-base`, new Vector3(x, 0.18, z + 0.58), 0.04, 0.22, materials.leg, shadow);
  chairBase.metadata = metadata;

  const screen = addSoftOutline(createBox(scene, `${name}-monitor`, new Vector3(x, 0.74, z - 0.1), { width: 0.34, height: 0.22, depth: 0.012 }, materials.monitor, shadow), 0.008, "#B8C3CF");
  screen.metadata = metadata;
  const stand = createCylinder(scene, `${name}-monitor-stand`, new Vector3(x, 0.6, z - 0.1), 0.025, 0.16, materials.leg, shadow);
  stand.metadata = metadata;
};

const createTaskCard = (
  scene: Scene,
  task: Task,
  position: Vector3,
  size: { width: number; height: number; depth: number },
  shadow?: ShadowGenerator,
) => {
  const mat = makeMat(scene, `task-card-mat-${task.task_id}`, taskStatusColor[task.status] || priorityColor[task.priority] || mutedBlue);
  const card = createBox(scene, `task-card-${task.task_id}`, position, size, mat, shadow);
  card.metadata = { taskId: task.task_id };
  const edge = createBox(
    scene,
    `task-card-edge-${task.task_id}`,
    new Vector3(position.x - size.width / 2 + 0.012, position.y + size.height * 0.05, position.z),
    { width: 0.018, height: size.height * 1.15, depth: size.depth * 1.04 },
    makeMat(scene, `task-priority-mat-${task.task_id}`, priorityColor[task.priority] || brandBlue),
    shadow,
  );
  edge.metadata = { taskId: task.task_id };
  return card;
};

const focusCamera = (camera: ArcRotateCamera | UniversalCamera, target: Vector3) => {
  if (camera instanceof ArcRotateCamera) {
    camera.setTarget(Vector3.Lerp(camera.target, target, 0.32));
    camera.radius = Math.max(10.5, Math.min(18, camera.radius * 0.92));
  } else {
    camera.setTarget(new Vector3(target.x, 0.9, target.z));
  }
};

const CloudLabScene3D = ({
  spaces,
  occupancy,
  members,
  activeSceneId,
  onSelectSpace,
  clusters = [],
  mode = "orbit",
  quality = "auto",
  onSelectMember,
  onSelectChat,
  tasks = [],
  onSelectTask,
  onFps,
}: CloudLabScene3DProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const joystickRef = useRef<JoystickState>({ active: false, pointerId: null, x: 0, y: 0 });
  const knobRef = useRef<HTMLDivElement | null>(null);
  const memberMap = useMemo(() => new Map(members.map((member) => [member.open_id, member])), [members]);

  const updateJoystickKnob = (x: number, y: number) => {
    if (!knobRef.current) return;
    knobRef.current.style.transform = `translate(calc(-50% + ${x * 34}px), calc(-50% + ${y * 34}px))`;
  };

  const resetJoystick = () => {
    joystickRef.current = { active: false, pointerId: null, x: 0, y: 0 };
    updateJoystickKnob(0, 0);
  };

  const updateJoystick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = (event.clientX - centerX) / (rect.width / 2);
    const dy = (event.clientY - centerY) / (rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const scale = distance > 1 ? 1 / distance : 1;
    const x = dx * scale;
    const y = dy * scale;
    joystickRef.current = { active: true, pointerId: event.pointerId, x, y };
    updateJoystickKnob(x, y);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const lowPower = quality === "low" || (quality === "auto" && (window.innerWidth < 760 || navigator.hardwareConcurrency <= 4));
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
    });
    engine.setHardwareScalingLevel(lowPower ? 1.45 : 1);
    const scene = new Scene(engine);
    scene.clearColor = Color4.FromHexString("#F7F8FAFF");
    scene.ambientColor = Color3.FromHexString("#FFFFFF");
    scene.collisionsEnabled = true;
    scene.environmentTexture = CubeTexture.CreateFromPrefilteredData("https://playground.babylonjs.com/textures/environment.env", scene);
    scene.environmentIntensity = 0.7;
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 0.9;
    scene.imageProcessingConfiguration.contrast = 1.15;
    scene.imageProcessingConfiguration.vignetteEnabled = false;
    scene.imageProcessingConfiguration.colorCurvesEnabled = true;

    const camera = mode === "walk"
      ? new UniversalCamera("walk-camera", new Vector3(0, 1.7, -9), scene)
      : new ArcRotateCamera("camera", -Math.PI / 2.45, Math.PI / 3.15, 22, new Vector3(0, 0.15, 0), scene);
    camera.attachControl(canvas, true);
    if (camera instanceof ArcRotateCamera) {
      camera.lowerRadiusLimit = 11;
      camera.upperRadiusLimit = 30;
      camera.wheelPrecision = 58;
      camera.panningSensibility = 95;
      camera.inertia = 0.92;
      camera.angularSensibilityX = 720;
      camera.angularSensibilityY = 720;
      camera.beta = Math.PI / 3.4;
    } else {
      camera.speed = 0.2;
      camera.angularSensibility = 4800;
      camera.keysUp.push(87);
      camera.keysDown.push(83);
      camera.keysLeft.push(65);
      camera.keysRight.push(68);
      camera.checkCollisions = true;
      camera.ellipsoid = new Vector3(0.38, 0.78, 0.38);
      camera.setTarget(new Vector3(0, 1.2, 0));
    }

    const sky = new HemisphericLight("enterprise-sky", new Vector3(-0.15, 1, -0.08), scene);
    sky.intensity = lowPower ? 0.8 : 0.92;
    sky.diffuse = Color3.FromHexString("#FBFCFE");
    sky.specular = Color3.FromHexString("#DCE4EC");
    sky.groundColor = Color3.FromHexString("#DDE4EB");
    const sun = new DirectionalLight("enterprise-sun", new Vector3(0.58, -0.82, 0.44), scene);
    sun.position = new Vector3(-9, 12, -8);
    sun.intensity = lowPower ? 1.25 : 2.0;
    const shadow = lowPower ? undefined : new ShadowGenerator(4096, sun);
    if (shadow) {
      shadow.useBlurExponentialShadowMap = true;
      shadow.blurKernel = 40;
      shadow.darkness = 0.22;
      shadow.bias = 0.0004;
      shadow.normalBias = 0.03;
      shadow.transparencyShadow = true;
    }

    const materials = createMaterials(scene);
    const floor = MeshBuilder.CreateGround("digital-twin-floor", { width: 26, height: 16 }, scene);
    floor.material = materials.floor;
    floor.receiveShadows = true;
    floor.checkCollisions = true;
    floor.position.y = -0.006;

    const ssao = lowPower ? null : new SSAO2RenderingPipeline("cloud-lab-ssao", scene, { ssaoRatio: 0.85, blurRatio: 1 }, [camera]);
    if (ssao) {
      ssao.radius = 1.8;
      ssao.totalStrength = 1.1;
      ssao.maxZ = 120;
      ssao.base = 0.16;
      ssao.expensiveBlur = true;
      ssao.samples = 16;
      ssao.textureSamples = 2;
      ssao.bilateralSamples = 12;
      ssao.bilateralSoften = 0.18;
      ssao.bilateralTolerance = 0.85;
    }
    const pipeline = new DefaultRenderingPipeline("cloud-lab-post", true, scene, [camera], true);
    pipeline.samples = lowPower ? 1 : 4;
    pipeline.fxaaEnabled = true;
    pipeline.imageProcessingEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.92;
    pipeline.bloomWeight = 0.08;
    pipeline.bloomKernel = lowPower ? 18 : 24;
    pipeline.sharpenEnabled = true;
    pipeline.sharpen.colorAmount = lowPower ? 0.18 : 0.28;
    pipeline.sharpen.edgeAmount = lowPower ? 0.52 : 0.72;

    const axisLineMat = makeMat(scene, "subtle-axis-line", "#DCE3EA", { emissive: 0.01 });
    for (let i = -3; i <= 3; i += 1) {
      createBox(scene, `floor-line-x-${i}`, new Vector3(i * 3.2, 0.006, 0), { width: 0.012, height: 0.006, depth: 13.2 }, axisLineMat);
      createBox(scene, `floor-line-z-${i}`, new Vector3(0, 0.007, i * 2.1), { width: 21.6, height: 0.006, depth: 0.012 }, axisLineMat);
    }

    const occupancyBySpace = new Map<number, LabOccupancy[]>();
    occupancy.forEach((item) => {
      occupancyBySpace.set(item.space_id, [...(occupancyBySpace.get(item.space_id) || []), item]);
    });
    const tasksByAssignee = new Map<string, Task[]>();
    const unassignedTasks = tasks.filter((task) => task.status !== "done" && task.status !== "cancelled" && !task.assignee_open_id);
    tasks
      .filter((task) => task.status !== "done" && task.status !== "cancelled" && task.assignee_open_id)
      .forEach((task) => {
        tasksByAssignee.set(task.assignee_open_id || "", [...(tasksByAssignee.get(task.assignee_open_id || "") || []), task]);
      });

    const columns = Math.min(3, Math.max(1, spaces.length));
    const rows = Math.max(1, Math.ceil(spaces.length / 3));
    const cellW = 6.4;
    const cellD = 4.1;
    const startX = -((columns - 1) * cellW) / 2;
    const startZ = -((rows - 1) * cellD) / 2;
    const hoverTargets: Mesh[] = [];
    const labelCards: Mesh[] = [];
    const glassPanels: Mesh[] = [];
    const glassFrames: Mesh[] = [];
    const zonePlates: Mesh[] = [];

    spaces.forEach((space, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + col * cellW;
      const z = startZ + row * cellD;
      const active = activeSceneId === "all" || activeSceneId === space.space_id;
      const zoneW = 4.8;
      const zoneD = 3.15;
      const rowsForSpace = occupancyBySpace.get(space.space_id) || [];
      const tint = makeTint(scene, zoneTints[index % zoneTints.length], active ? 0.09 : 0.035);

      zonePlates.push(createPlatform(scene, `zone-platform-${space.space_id}`, new Vector3(x, 0.004, z), { width: zoneW, depth: zoneD }, materials));
      const zone = createBox(scene, `zone-${space.space_id}`, new Vector3(x, 0.045, z), { width: zoneW * 0.985, height: 0.024, depth: zoneD * 0.985 }, tint);
      zone.metadata = { spaceId: space.space_id, focusTarget: new Vector3(x, 0.2, z) };
      zone.isPickable = true;
      hoverTargets.push(zone);

      const wallHeight = 1.18;
      [
        createBox(scene, `zone-${space.space_id}-wall-back`, new Vector3(x, wallHeight / 2 + 0.03, z + zoneD / 2), { width: zoneW, height: wallHeight, depth: 0.055 }, materials.wall, shadow),
        createBox(scene, `zone-${space.space_id}-wall-left`, new Vector3(x - zoneW / 2, wallHeight / 2 + 0.03, z), { width: 0.055, height: wallHeight, depth: zoneD }, materials.wall, shadow),
      ].forEach((wall) => {
        wall.metadata = { spaceId: space.space_id, focusTarget: new Vector3(x, 0.2, z) };
      });
      const glass = createBox(scene, `zone-${space.space_id}-glass`, new Vector3(x + zoneW / 2, 0.75, z), { width: 0.035, height: 1.12, depth: zoneD * 0.82 }, materials.glass, shadow);
      glass.metadata = { spaceId: space.space_id, focusTarget: new Vector3(x, 0.2, z) };
      glass.metadata = { ...(glass.metadata || {}), lodGlass: true };
      glassPanels.push(glass);
      const glassFrame = createBox(scene, `zone-${space.space_id}-glass-frame`, new Vector3(x + zoneW / 2, 1.3, z), { width: 0.05, height: 0.04, depth: zoneD * 0.88 }, materials.glassFrame, shadow);
      glassFrame.metadata = { ...(glassFrame.metadata || {}), lodGlassFrame: true, spaceId: space.space_id, focusTarget: new Vector3(x, 0.2, z) };
      glassFrames.push(glassFrame);

      const zoneLabel = createLabel(scene, space.name, new Vector3(x - zoneW * 0.2, 0.075, z - zoneD / 2 - 0.42), 2.35);
      labelCards.push(zoneLabel);
      zoneLabel.metadata = {
        spaceId: space.space_id,
        focusTarget: new Vector3(x, 0.2, z),
      };

      const deskSlots = [
        [-1.45, -0.55],
        [0, -0.55],
        [1.45, -0.55],
        [-1.45, 0.66],
        [0, 0.66],
        [1.45, 0.66],
      ];
      const deskCount = Math.min(6, Math.max(3, rowsForSpace.length || Math.ceil((space.capacity || 6) / 16)));
      for (let deskIndex = 0; deskIndex < deskCount; deskIndex += 1) {
        const [dx, dz] = deskSlots[deskIndex];
        const occupant = rowsForSpace[deskIndex];
        const occupantTasks = occupant?.member_open_id ? (tasksByAssignee.get(occupant.member_open_id) || []) : [];
        createDesk(
          scene,
          `desk-${space.space_id}-${deskIndex}`,
          x + dx,
          z + dz,
          materials,
          { spaceId: space.space_id, memberOpenId: occupant?.member_open_id || "", focusTarget: new Vector3(x + dx, 0.45, z + dz) },
          shadow,
        );
        if (occupant) {
          const marker = MeshBuilder.CreateSphere(`member-${occupant.occupancy_id}`, { diameter: 0.2, segments: 16 }, scene);
          marker.position = new Vector3(x + dx - 0.32, 0.84, z + dz + 0.02);
          marker.material = makeMat(scene, `member-mat-${occupant.occupancy_id}`, statusColor[occupant.status] || mutedBlue);
          marker.metadata = {
            spaceId: space.space_id,
            memberOpenId: occupant.member_open_id || "",
            focusTarget: new Vector3(x + dx, 0.45, z + dz),
            title: memberMap.get(occupant.member_open_id || "")?.name || occupant.member_open_id || "未识别成员",
          };
          if (shadow) shadow.addShadowCaster(marker);
        }
        occupantTasks.slice(0, lowPower ? 2 : 3).forEach((task, taskIndex) => {
          createTaskCard(scene, task, new Vector3(x + dx - 0.28 + taskIndex * 0.25, 0.585, z + dz - 0.1), { width: 0.2, height: 0.026, depth: 0.16 }, shadow);
        });
      }

      const board = createBox(scene, `task-board-${space.space_id}`, new Vector3(x + zoneW / 2 - 0.72, 0.98, z + zoneD / 2 - 0.13), { width: 1.08, height: 0.7, depth: 0.045 }, materials.white, shadow);
      board.metadata = { spaceId: space.space_id, focusTarget: new Vector3(x, 0.2, z) };
      const boardTasks = [
        ...unassignedTasks.slice(index * 2, index * 2 + 2),
        ...rowsForSpace.flatMap((entry) => (entry.member_open_id ? (tasksByAssignee.get(entry.member_open_id) || []).slice(0, 1) : [])).slice(0, 4),
      ].slice(0, lowPower ? 4 : 6);
      boardTasks.forEach((task, taskIndex) => {
        const taskCol = taskIndex % 3;
        const taskRow = Math.floor(taskIndex / 3);
        createTaskCard(
          scene,
          task,
          new Vector3(x + zoneW / 2 - 1.04 + taskCol * 0.28, 0.85 + taskRow * 0.22, z + zoneD / 2 - 0.18),
          { width: 0.21, height: 0.14, depth: 0.028 },
          shadow,
        );
      });

      if (rowsForSpace.length > 0) {
        const countBadge = createBox(scene, `zone-${space.space_id}-badge`, new Vector3(x + zoneW / 2 - 0.38, 0.1, z - zoneD / 2 - 0.42), { width: 0.7, height: 0.04, depth: 0.28 }, materials.label, shadow);
        countBadge.metadata = { spaceId: space.space_id, focusTarget: new Vector3(x, 0.2, z) };
      }
    });

    clusters.slice(0, lowPower ? 4 : 8).forEach((cluster, index) => {
      const angle = (index / Math.max(1, Math.min(clusters.length, lowPower ? 4 : 8))) * Math.PI * 2;
      const x = Math.cos(angle) * 8.2;
      const z = Math.sin(angle) * 5.35;
      const table = createCylinder(scene, `chat-table-${cluster.cluster_id}`, new Vector3(x, 0.56, z), 1.0, 0.06, materials.white, shadow);
      table.metadata = { clusterId: cluster.cluster_id, focusTarget: new Vector3(x, 0.4, z) };
      const chatLabel = createLabel(scene, cluster.chat_name || "群聊圆桌", new Vector3(x, 0.09, z - 0.92), 1.9);
      labelCards.push(chatLabel);
      chatLabel.metadata = {
        clusterId: cluster.cluster_id,
        focusTarget: new Vector3(x, 0.4, z),
      };
      const seatCount = Math.min(6, Math.max(3, cluster.member_names.length));
      for (let seat = 0; seat < seatCount; seat += 1) {
        const seatAngle = angle + (seat / seatCount) * Math.PI * 2;
        const chair = createBox(
          scene,
          `chat-chair-${cluster.cluster_id}-${seat}`,
          new Vector3(x + Math.cos(seatAngle) * 0.82, 0.28, z + Math.sin(seatAngle) * 0.82),
          { width: 0.32, height: 0.05, depth: 0.32 },
          materials.softWhite,
          shadow,
        );
        chair.metadata = { clusterId: cluster.cluster_id, focusTarget: new Vector3(x, 0.4, z) };
      }
    });

    let hovered: Mesh | null = null;
    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
        const mesh = pointerInfo.pickInfo?.pickedMesh as Mesh | null;
        if (mesh !== hovered) {
          if (hovered && hoverTargets.includes(hovered)) hovered.scaling.y = 1;
          hovered = mesh && hoverTargets.includes(mesh) ? mesh : null;
          if (hovered) hovered.scaling.y = 1.8;
        }
        return;
      }
      if (pointerInfo.type !== PointerEventTypes.POINTERPICK) return;
      const mesh = pointerInfo.pickInfo?.pickedMesh as Mesh | null;
      const focusTarget = mesh?.metadata?.focusTarget as Vector3 | undefined;
      if (focusTarget) focusCamera(camera, focusTarget);
      const spaceId = mesh?.metadata?.spaceId;
      if (typeof spaceId === "number") onSelectSpace(spaceId);
      const memberOpenId = mesh?.metadata?.memberOpenId;
      if (typeof memberOpenId === "string" && memberOpenId) onSelectMember?.(memberOpenId);
      const clusterId = mesh?.metadata?.clusterId;
      if (typeof clusterId === "string" && clusterId) onSelectChat?.(clusterId);
      const taskId = mesh?.metadata?.taskId;
      if (typeof taskId === "number") onSelectTask?.(taskId);
    });

    scene.onKeyboardObservable.add((event) => {
      if (event.type !== KeyboardEventTypes.KEYDOWN || !(camera instanceof UniversalCamera)) return;
      if (event.event.key.toLowerCase() === "r") camera.position = new Vector3(0, 1.7, -9);
    });

    scene.onBeforeRenderObservable.add(() => {
      if (!(camera instanceof UniversalCamera) || !joystickRef.current.active) return;
      const { x, y } = joystickRef.current;
      const yaw = camera.rotation.y;
      const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).scale(-y * camera.speed * 1.45);
      const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).scale(x * camera.speed * 1.45);
      camera.cameraDirection.addInPlace(forward.add(right));
    });

    let lastFarMode = false;
    scene.onBeforeRenderObservable.add(() => {
      const farMode = camera instanceof ArcRotateCamera && camera.radius >= 20.5;
      if (farMode === lastFarMode) return;
      lastFarMode = farMode;
      zonePlates.forEach((mesh) => {
        const material = mesh.material as StandardMaterial;
        material.emissiveColor = Color3.FromHexString(platformHex).scale(farMode ? 0.06 : 0.024);
      });
      glassPanels.forEach((mesh) => {
        mesh.scaling.x = farMode ? 1.4 : 1;
        mesh.scaling.z = farMode ? 1.06 : 1;
        const material = mesh.material as PBRMaterial;
        material.alpha = farMode ? 0.68 : 0.55;
      });
      glassFrames.forEach((mesh) => {
        mesh.scaling.x = farMode ? 1.4 : 1;
        mesh.scaling.z = farMode ? 1.08 : 1;
      });
      labelCards.forEach((mesh) => {
        mesh.scaling.x = farMode ? 1.12 : 1;
        mesh.scaling.z = farMode ? 1.12 : 1;
        const material = mesh.material as StandardMaterial;
        material.emissiveColor = Color3.FromHexString("#FFFFFF").scale(farMode ? 0.18 : 0.08);
      });
    });

    const resizeObserver = new ResizeObserver(() => engine.resize());
    resizeObserver.observe(canvas);
    let lastFpsAt = 0;
    engine.runRenderLoop(() => {
      scene.render();
      const now = performance.now();
      if (onFps && now - lastFpsAt > 800) {
        lastFpsAt = now;
        const fps = Math.round(engine.getFps());
        if (Number.isFinite(fps)) onFps(fps);
      }
    });

    return () => {
      resizeObserver.disconnect();
      ssao?.dispose();
      pipeline.dispose();
      scene.dispose();
      engine.dispose();
    };
  }, [activeSceneId, clusters, memberMap, mode, occupancy, onFps, onSelectChat, onSelectMember, onSelectSpace, onSelectTask, quality, spaces, tasks]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="cloud-lab-3d-canvas"
        aria-label="云实验室 3D 场景"
      />
      {mode === "walk" ? (
        <div
          className="cloud-lab-joystick"
          aria-label="移动摇杆"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            updateJoystick(event);
          }}
          onPointerMove={(event) => {
            if (joystickRef.current.pointerId === event.pointerId) updateJoystick(event);
          }}
          onPointerUp={resetJoystick}
          onPointerCancel={resetJoystick}
        >
          <div ref={knobRef} className="cloud-lab-joystick-knob" />
        </div>
      ) : null}
    </>
  );
};

export default CloudLabScene3D;
