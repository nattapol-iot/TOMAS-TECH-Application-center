import TOMAS_UI_CSS from "../tomas-ui.css?inline";

// Tailwind inlines the package's @fontsource imports but keeps their url(./files/...) relative to the
// fontsource package, which the bundler cannot see through ?inline. The bundler emits the files from here
// instead and the inline CSS is pointed at them; the three packages never share a file name.
const FONT_FILES = import.meta.glob<string>(
  [
    "/node_modules/@fontsource-variable/noto-sans/files/*.woff2",
    "/node_modules/@fontsource-variable/noto-sans-jp/files/*.woff2",
    "/node_modules/@fontsource/sarabun/files/*-{400,500,600,700}-normal.woff2",
  ],
  { query: "?url", import: "default", eager: true, exhaustive: true },
);

const FONT_URLS = new Map(Object.entries(FONT_FILES).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1), url]));

export const TOMAS_UI_STYLES = TOMAS_UI_CSS.replace(/url\(\.\/files\/([^)]+)\)/g, (link, name: string) => {
  const url = FONT_URLS.get(name);
  return url ? `url(${url})` : link;
});
