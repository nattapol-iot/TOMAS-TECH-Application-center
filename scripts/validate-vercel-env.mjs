const target = process.env.VERCEL_TARGET_ENV ?? process.env.VERCEL_ENV;
const explicitLocalPreview = process.env.VERCEL_PREVIEW_BUILD === "1";
const productionAppMode = process.env.NEXT_PUBLIC_APP_MODE === "production";

if (target === "production" || productionAppMode) {
  await import("./validate-production-env.mjs");
} else if (target === "preview" || target === "development" || explicitLocalPreview) {
  console.log("Vercel preview build: production environment validation is deferred until promotion.");
} else {
  console.error("Vercel build target is unknown. Set VERCEL_PREVIEW_BUILD=1 only for an intentional local preview build.");
  process.exit(1);
}
