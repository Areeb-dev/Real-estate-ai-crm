import http from "http";
import path from "path";
import { createApp } from "./app";
import { env } from "./config/env";
import { initSocket } from "./sockets";

async function bootstrap() {
  const serveWeb =
    process.env.SERVE_WEB === "1" ||
    process.env.SERVE_WEB === "true" ||
    process.env.SERVE_WEB === "TRUE";

  let webHandler: Parameters<typeof createApp>[0]["webHandler"];

  if (serveWeb) {
    // next is provided by the web workspace (hoisted in the monorepo)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const next = require("next") as typeof import("next");
    const nextApp = next({
      dev: false,
      dir: path.join(__dirname, "../../web"),
    });
    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();
    webHandler = (req, res) => handle(req, res);
    console.log("Serving Next.js web app from the API process");
  }

  const app = createApp({ webHandler });
  const server = http.createServer(app);

  initSocket(server);

  server.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
