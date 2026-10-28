/** Deployment base path ("" on Vercel/local, "/Aa" on GitHub Pages). */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const withBase = (p: string) => `${BASE}${p}`;
/** True when built as a static site (no server, so no AI routes). */
export const STATIC_BUILD = process.env.NEXT_PUBLIC_STATIC === "1";
