import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

let io: Server | null = null;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: env.corsOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token || typeof token !== "string") {
      return next(new Error("Authentication required"));
    }
    try {
      const payload = jwt.verify(token, env.jwtSecret) as { id: string };
      socket.data.userId = payload.id;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    socket.join("dashboard");
    socket.on("disconnect", () => undefined);
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.IO not initialized");
  }
  return io;
}

export function emitCallUpdate(payload: unknown) {
  io?.to("dashboard").emit("call:update", payload);
}

export function emitLeadUpdate(payload: unknown) {
  io?.to("dashboard").emit("lead:update", payload);
}

export function emitDashboardRefresh() {
  io?.to("dashboard").emit("dashboard:refresh", { at: new Date().toISOString() });
}

export function emitNotification(payload: unknown) {
  io?.to("dashboard").emit("notification:new", payload);
}
