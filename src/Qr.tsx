import qrcode from "qrcode-generator";
import { useMemo } from "react";

export function Qr({ value, size = 220, dark = "#1a0b2e", light = "#ffffff" }: { value: string; size?: number; dark?: string; light?: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let path = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + 2},${r + 2}h1v1h-1z`;
    return { n: n + 4, path };
  }, [value]);
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${svg.n} ${svg.n}`} shapeRendering="crispEdges" role="img" aria-label="QR code">
      <rect width={svg.n} height={svg.n} fill={light} rx="1.5" />
      <path d={svg.path} fill={dark} />
    </svg>
  );
}
