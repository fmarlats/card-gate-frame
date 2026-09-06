import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const port = Number(process.env.PLAYWRIGHT_PORT ?? "4173");
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535");
}
const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixturePath = resolve(repositoryRoot, "tests/browser/fixture.html");
const distributionRoot = resolve(repositoryRoot, "dist");
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
]);
const resolveStaticPath = (pathname) => {
  if (pathname === "/tests/browser/fixture.html") return fixturePath;
  if (!pathname.startsWith("/dist/")) return null;

  const requestedPath = resolve(repositoryRoot, `.${pathname}`);
  const extension = extname(requestedPath);
  return requestedPath.startsWith(`${distributionRoot}${sep}`) &&
    (extension === ".js" || extension === ".map")
    ? requestedPath
    : null;
};
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const staticPath = resolveStaticPath(url.pathname);
  if (request.method === "GET" && staticPath !== null) {
    try {
      const body = await readFile(staticPath);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": contentTypes.get(extname(staticPath)) ?? "application/octet-stream",
      });
      response.end(body);
    } catch (error) {
      const status =
        error instanceof Error && "code" in error && error.code === "ENOENT" ? 404 : 500;
      response.writeHead(status).end();
    }
    return;
  }

  vite.middlewares(request, response, () => response.writeHead(404).end());
});
const vite = await createViteServer({
  root: repositoryRoot,
  appType: "mpa",
  logLevel: "error",
  // Vite's injected client still connects when HMR updates are disabled.
  // Share the test server's socket instead of leaving that connection unserved.
  server: { middlewareMode: true, hmr: false, ws: { server }, watch: null },
});

server.listen(port, "127.0.0.1");

const close = () => {
  void vite.close().then(() => server.close(() => process.exit(0)));
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
