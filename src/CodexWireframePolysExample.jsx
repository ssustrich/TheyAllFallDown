/*
 * Milestone Build v1.0 — 2025-09-06 (America/Chicago)
 * Status: Baseline rotating wireframe cube → planar subdivision (bounded faces) with 2D separation.
 * Notes: Half-edge face walk; outer face dropped; up to 7 bounded regions depending on orientation.
 * Next candidates: orientation randomizer, polygon labeling, export to SVG, deterministic epsilon tuning, Vite project packaging.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * "Codex" style example: a single-file React component you can drop anywhere.
 *
 * Rotating wireframe cube → on button press, project its 3D edges to 2D,
 * compute the planar subdivision (bounded polygons formed by the lines),
 * and separate those 2D polygons outward.
 */
export default function CodexWireframePolysExample() {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  const [mode, setMode] = useState("cube"); // "cube" | "polys"
  const [explodeT, setExplodeT] = useState(0); // 0..1
  const facesRef = useRef([]); // cached polygons in 2D once computed
  const rotRef = useRef({ x: 0, y: 0 });

  // -------- Cube geometry --------
  const V = useMemo(
    () => [
      [-1, -1, -1], // 0
      [ 1, -1, -1], // 1
      [ 1,  1, -1], // 2
      [-1,  1, -1], // 3
      [-1, -1,  1], // 4
      [ 1, -1,  1], // 5
      [ 1,  1,  1], // 6
      [-1,  1,  1], // 7
    ],
    []
  );

  const E = useMemo(
    () => [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ],
    []
  );

  // -------- Math helpers --------
  const EPS = 1e-6;

  function rotateY([x, y, z], a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [c * x + s * z, y, -s * x + c * z];
  }
  function rotateX([x, y, z], a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [x, c * y - s * z, s * y + c * z];
  }
  function project([x, y, z], w, h, fov = 500, dist = 3) {
    const zz = z + dist;
    const s = fov / (fov + zz * 100);
    return [w * 0.5 + x * 100 * s, h * 0.5 - y * 100 * s];
  }

  // 2D segment intersection
  function segIntersect(a, b, c, d) {
    const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1];
    const x3 = c[0], y3 = c[1], x4 = d[0], y4 = d[1];
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < EPS) return null; // parallel or nearly

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (c[0] - c[0])) / den;
    const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;

    const xi = x1 + t * (x2 - x1);
    const yi = y1 + t * (y2 - y1);
    return [xi, yi, t, u];
  }

  function uniquePushPoint(arr, p) {
    for (const q of arr) {
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-5) return;
    }
    arr.push(p);
  }

  // Planar subdivision → bounded faces
  function polygonizeSegments(segments) {
    // 1) collect intersections per segment
    const allPtsPerSeg = segments.map(() => []);
    segments.forEach((seg, i) => {
      const [a, b] = seg;
      allPtsPerSeg[i].push([a[0], a[1], 0]);
      allPtsPerSeg[i].push([b[0], b[1], 1]);
    });

    for (let i = 0; i < segments.length; i++) {
      const [a1, b1] = segments[i];
      for (let j = i + 1; j < segments.length; j++) {
        const [a2, b2] = segments[j];
        const hit = segIntersect(a1, b1, a2, b2);
        if (hit) {
          const [x, y, tA, uB] = hit;
          uniquePushPoint(allPtsPerSeg[i], [x, y, tA]);
          uniquePushPoint(allPtsPerSeg[j], [x, y, uB]);
        }
      }
    }

    // 2) split into atomic edges
    const edges = [];
    allPtsPerSeg.forEach((pts) => {
      pts.sort((p, q) => p[2] - q[2]);
      for (let k = 0; k < pts.length - 1; k++) {
        const p = pts[k], q = pts[k + 1];
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5) {
          edges.push({ v1: [p[0], p[1]], v2: [q[0], q[1]] });
        }
      }
    });

    // 3) half-edges + angular ordering
    const key = (x, y) => `${x.toFixed(5)},${y.toFixed(5)}`;
    const Vmap = new Map();
    function vget(p) {
      const k = key(p[0], p[1]);
      let e = Vmap.get(k);
      if (!e) {
        e = { x: p[0], y: p[1], out: [] };
        Vmap.set(k, e);
      }
      return e;
    }

    const halfEdges = [];
    edges.forEach((e) => {
      const a = vget(e.v1), b = vget(e.v2);
      const angleAB = Math.atan2(b.y - a.y, b.x - a.x);
      const angleBA = Math.atan2(a.y - b.y, a.x - b.x);
      const h1 = { from: a, to: b, angle: angleAB, used: false };
      const h2 = { from: b, to: a, angle: angleBA, used: false };
      h1.twin = h2; h2.twin = h1;
      halfEdges.push(h1, h2);
      a.out.push(h1); b.out.push(h2);
    });

    for (const v of Vmap.values()) {
      v.out.sort((e1, e2) => e1.angle - e2.angle);
    }

    function nextCCW(h) {
      const v = h.to;
      const arr = v.out;
      const idx = arr.indexOf(h.twin);
      const n = arr.length;
      return arr[(idx - 1 + n) % n];
    }

    // 4) walk faces
    const faces = [];
    for (const h of halfEdges) {
      if (h.used) continue;
      let curr = h;
      const poly = [];
      while (!curr.used) {
        curr.used = true;
        poly.push([curr.from.x, curr.from.y]);
        curr = nextCCW(curr);
        if (curr === h) break;
      }
      if (poly.length >= 3) faces.push(poly);
    }

    function area2(poly) {
      let a = 0;
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
        a += x1 * y2 - x2 * y1;
      }
      return 0.5 * a;
    }

    function dedupeClose(poly) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        out.push(p);
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-4) i++;
      }
      return out;
    }

    function compressCollinear(poly) {
      const n = poly.length;
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n];
        const abx = b[0] - a[0], aby = b[1] - a[1];
        const bcx = c[0] - b[0], bcy = c[1] - b[1];
        const cross = abx * bcy - aby * bcx;
        if (Math.abs(cross) > 1e-6) out.push(b);
      }
      return out.length >= 3 ? out : poly;
    }

    const cleaned = faces
      .map((p) => compressCollinear(dedupeClose(p)))
      .filter((p) => p.length >= 3 && Math.abs(area2(p)) > 1.0);

    if (!cleaned.length) return [];

    const areas = cleaned.map((p) => Math.abs(area2(p)));
    const maxIdx = areas.indexOf(Math.max(...areas));
    return cleaned.filter((_, i) => i !== maxIdx);
  }

  function centroid2D(poly) {
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      const w = x1 * y2 - x2 * y1;
      A += w; cx += (x1 + x2) * w; cy += (y1 + y2) * w;
    }
    A *= 0.5;
    if (Math.abs(A) < EPS) {
      let sx = 0, sy = 0;
      for (const [x, y] of poly) { sx += x; sy += y; }
      return [sx / poly.length, sy / poly.length];
    }
    return [cx / (6 * A), cy / (6 * A)];
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const w = canvas.clientWidth;
       const h = canvas.clientHeight;
    canvas.width = w; canvas.height = h;

    let t0 = performance.now();

    function loop(t) {
      const dt = (t - t0) / 1000;
      t0 = t;

      if (mode === "cube") {
        rotRef.current.y += dt * 0.8;
        rotRef.current.x += dt * 0.4;
      }

      const target = mode === "polys" ? 1 : 0;
      const speed = 3.0;
      const d = target - explodeT;
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * speed);
      if (step !== 0) setExplodeT(explodeT + step);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0b0f19";
      ctx.fillRect(0, 0, w, h);

      const verts3D = V.map((v) => rotateX(rotateY(v, rotRef.current.y), rotRef.current.x));
      const verts2D = verts3D.map((v) => project(v, w, h));

      if (explodeT < 0.001 && mode === "cube") {
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#7dd3fc";
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        for (const [a, b] of E) {
          const [x1, y1] = verts2D[a], [x2, y2] = verts2D[b];
          ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        }
        ctx.stroke();
      } else {
        const polys = facesRef.current.length
          ? facesRef.current
          : (() => {
              const segs = E.map(([a, b]) => [verts2D[a], verts2D[b]]);
              const faces = polygonizeSegments(segs);
              facesRef.current = faces;
              return faces;
            })();

        const cx = w * 0.5, cy = h * 0.5;
        const maxDist = Math.min(w, h) * 0.22;

        const withArea = polys
          .map((p) => {
            const [fx, fy] = centroid2D(p);
            let dx = fx - cx, dy = fy - cy;
            const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
            const offX = dx * maxDist * explodeT;
            const offY = dy * maxDist * explodeT;
            const moved = p.map(([x, y]) => [x + offX, y + offY]);
            let A = 0; for (let i = 0; i < moved.length; i++) {
              const [x1, y1] = moved[i], [x2, y2] = moved[(i + 1) % moved.length];
              A += x1 * y2 - x2 * y1;
            }
            return { poly: moved, area: Math.abs(A) };
          })
          .sort((a, b) => a.area - b.area);

        for (const { poly } of withArea) {
          ctx.beginPath();
          poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
          ctx.closePath();
          ctx.globalAlpha = 0.15; ctx.fillStyle = "#93c5fd"; ctx.fill();
          ctx.globalAlpha = 0.95; ctx.lineWidth = 2; ctx.strokeStyle = "#60a5fa"; ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mode, explodeT, V, E]);

  function toggleMode() {
    if (mode === "cube") {
      facesRef.current = []; // recompute from *current* projection
      setMode("polys");
    } else {
      setMode("cube");
    }
  }

  return (
    <div style={{ minHeight: '100vh', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24, color: '#e5e7eb' }}>
      <div style={{ width: 560, maxWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Wireframe → Planar Polygons (2D)</h2>
        <button
          onClick={toggleMode}
          title={mode === "cube" ? "Project & polygonize" : "Return to 3D wireframe"}
          style={{ padding: '8px 12px', borderRadius: 16, border: '1px solid #475569', background: '#0f172a', color: 'white', cursor: 'pointer' }}
        >
          {mode === "cube" ? "Flatten to 2D polys" : "Back to cube"}
        </button>
      </div>

      <canvas
        ref={canvasRef}
        style={{ width: 560, height: 560, background: "#0b0f19", borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
      />

      <p style={{ opacity: 0.8, fontSize: 14 }}>
        Polygon mode shows the bounded regions formed by the projected cube edges (commonly up to 7), separated in 2D.
      </p>
    </div>
  );
}
