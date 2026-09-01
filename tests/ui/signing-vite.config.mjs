import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({plugins:[react()],resolve:{alias:[{find:"../api-client",replacement:fileURLToPath(new URL("./signing-api-fixture.ts",import.meta.url))}]},server:{host:"127.0.0.1",port:3311,strictPort:true}});
