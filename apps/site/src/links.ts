export const sitePage = (path: string) => import.meta.env.BASE_URL.replace(/\/?$/, "/") + path;
export const clientPage = (hash = "") =>
  (import.meta.env.PUBLIC_FLARE_APP_URL || (import.meta.env.BASE_URL === "/" ? "http://localhost:3000" : "")).replace(/\/$/, "") + "/" + hash;
