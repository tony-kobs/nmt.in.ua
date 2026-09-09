export function getFoldTransform(width: number, height: number, top: number, bottom: number) {
  const x = width * top / 100;
  const dx = width * (bottom - top) / 100;
  const lengthSquared = dx * dx + height * height;
  const a = (dx * dx - height * height) / lengthSquared;
  const b = 2 * dx * height / lengthSquared;
  const d = -a;

  return `matrix(${a}, ${b}, ${b}, ${d}, ${(1 - a) * x}, ${-b * x})`;
}
