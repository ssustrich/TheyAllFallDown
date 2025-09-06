# Wireframe → Planar Polygons (Milestone v1.0)

Rotating 3D wireframe cube that, on button press, projects to 2D and computes the planar subdivision of the projected edges.
The bounded regions (up to 7 depending on orientation) are then separated outward in screen space.

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL in your browser.

## Build for production

```bash
npm run build
npm run preview
```

## Notes
- Milestone v1.0 (2025-09-06, America/Chicago).
- Half-edge walk of a planar straight-line graph to extract bounded faces; outer (unbounded) face dropped.
- The UI uses simple inline styles; no Tailwind or other CSS frameworks required.
