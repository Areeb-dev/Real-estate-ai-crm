import http from "http";
import path from "path";
import type { Request, Response } from "express";
import { createApp, type CreateAppOptions } from "./app";
import { env } from "./config/env";
import { initSocket } from "./sockets";

type NextServerFactory = (options: { dev?: boolean; dir?: string }) => {
  prepare: () => Promise<void>;
  getRequestHandler: () => (req: Request, res: Response) => void;
};

async function bootstrap() {
  const serveWeb =
    process.env.SERVE_WEB === "1" ||
    process.env.SERVE_WEB === "true" ||
    process.env.SERVE_WEB === "TRUE";

  let webHandler: CreateAppOptions["webHandler"];

  if (serveWeb) {
    // next is provided by the web workspace (hoisted in the monorepo)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nextModule = require("next") as { default?: NextServerFactory } & NextServerFactory;
    const createNextApp = nextModule.default ?? nextModule;
    const nextApp = createNextApp({
      dev: false,
      dir: path.join(__dirname, "../../web"),
    });
    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();
    webHandler = (req: Request, res: Response) => handle(req, res);
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
