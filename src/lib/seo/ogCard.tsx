import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

let fontData: ArrayBuffer | null = null;

export async function loadOgFont(): Promise<ArrayBuffer> {
  if (fontData) return fontData;
  const buf = await readFile(
    path.join(process.cwd(), "src/lib/seo/fonts/Manrope-SemiBold.ttf"),
  );
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  fontData = copy.buffer;
  return fontData;
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  const chars = [...clean];
  if (chars.length <= max) return clean;
  return chars.slice(0, max).join("").replace(/[\s,;:.]+$/u, "");
}

export async function renderBrandOg(input: {
  kicker?: string;
  title: string;
  subtitle: string;
}) {
  const font = await loadOgFont();
  const title = clip(input.title, 52);
  const subtitle = clip(input.subtitle, 90);
  const kicker = clip(input.kicker ?? "НМТ · математика", 40);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#efe8d7",
          color: "#1c1917",
          padding: "72px",
          fontFamily: "Manrope",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "84px",
              height: "84px",
              borderRadius: "16px",
              background: "#0f766e",
              color: "#f6f1e2",
              fontSize: "40px",
            }}
          >
            L
          </div>
          <div style={{ display: "flex", marginLeft: "24px", fontSize: "40px", color: "#0f766e" }}>
            LevelUP
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: "28px", color: "#3c3631" }}>{kicker}</div>
          <div
            style={{
              display: "flex",
              marginTop: "18px",
              fontSize: "64px",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
            }}
          >
            {title}
          </div>
          <div style={{ display: "flex", marginTop: "20px", fontSize: "30px", color: "#3c3631" }}>
            {subtitle}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [{ name: "Manrope", data: font, weight: 600, style: "normal" }],
    },
  );
}
