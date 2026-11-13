"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function useSocket(handlers: {
  onCallUpdate?: (payload: unknown) => void;
  onLeadUpdate?: (payload: unknown) => void;
  onDashboardRefresh?: () => void;
  onNotification?: (payload: unknown) => void;
}) {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!token) return;

    const socket = API_URL
      ? io(API_URL, {
          auth: { token },
          transports: ["websocket", "polling"],
        })
      : io({
          auth: { token },
          transports: ["websocket", "polling"],
        });

    socketRef.current = socket;

    socket.on("call:update", (payload) => handlersRef.current.onCallUpdate?.(payload));
    socket.on("lead:update", (payload) => handlersRef.current.onLeadUpdate?.(payload));
    socket.on("dashboard:refresh", () => handlersRef.current.onDashboardRefresh?.());
    socket.on("notification:new", (payload) => handlersRef.current.onNotification?.(payload));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);
}
