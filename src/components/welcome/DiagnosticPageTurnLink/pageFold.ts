export function getFoldTransform(width: number, height: number, top: number, bottom: number) {
  const x = width * top / 100;
  const dx = width * (bottom - top) / 100;
  const lengthSquared = dx * dx + height * height;
  const a = (dx * dx - height * height) / lengthSquared;
  const b = 2 * dx * height / lengthSquared;
  const d = -a;

  return `matrix(${a}, ${b}, ${b}, ${d}, ${(1 - a) * x}, ${-b * x})`;
}

const foldPoses = [
  { progress: 0, top: 100, bottom: 100 },
  { progress: 0.12, top: 85, bottom: 100 },
  { progress: 0.4, top: 30, bottom: 78 },
  { progress: 0.75, top: -25, bottom: 35 },
  { progress: 1, top: -70, bottom: -15 },
];

function getSlope(index: number, edge: "top" | "bottom") {
  if (index === 0 || index === foldPoses.length - 1) return 0;
  const previous = foldPoses[index - 1];
  const current = foldPoses[index];
  const next = foldPoses[index + 1];
  const incoming = (current[edge] - previous[edge]) / (current.progress - previous.progress);
  const outgoing = (next[edge] - current[edge]) / (next.progress - current.progress);
  if (incoming * outgoing <= 0) return 0;
  return 2 * incoming * outgoing / (incoming + outgoing);
}

const foldSlopes = foldPoses.map((_, index) => ({
  top: getSlope(index, "top"),
  bottom: getSlope(index, "bottom"),
}));

export function getFoldPosition(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  const index = foldPoses.findIndex((pose, i) => i < foldPoses.length - 1 && clamped <= foldPoses[i + 1].progress);
  const start = foldPoses[index];
  const end = foldPoses[index + 1];
  const duration = end.progress - start.progress;
  const t = (clamped - start.progress) / duration;
  const t2 = t * t;
  const t3 = t2 * t;
  const interpolate = (edge: "top" | "bottom") =>
    start[edge] +
    (t3 - 2 * t2 + t) * duration * foldSlopes[index][edge] +
    (-2 * t3 + 3 * t2) * (end[edge] - start[edge]) +
    (t3 - t2) * duration * foldSlopes[index + 1][edge];
  return { top: interpolate("top"), bottom: interpolate("bottom") };
}
