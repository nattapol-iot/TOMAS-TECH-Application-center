import tailwind from "@tailwindcss/postcss";
import tomasUiScope from "./scripts/postcss-tomas-ui-scope.mjs";

// Tailwind builds only the files that ask for it (the @tomas-tc/ui sheets); the scope plugin then moves the island sheet
// (app/system/tomas-ui/tomas-ui-island.css) under .tui and leaves every other file alone.
const config = {
  plugins: [tailwind(), tomasUiScope()],
};

export default config;
