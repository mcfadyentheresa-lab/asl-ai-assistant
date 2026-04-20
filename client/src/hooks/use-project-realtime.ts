import { useEffect, useRef, useState, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface ProjectViewer {
  userId: string;
  firstName: string;
  lastName: string;
  role: string;
  profileImageUrl: string | null;
}

const RESOURCE_LABELS: Record<string, string> = {
  tasks: "tasks",
  milestones: "milestones",
  sections: "sections",
  photos: "photos",
  documents: "documents",
  messages: "messages",
  estimates: "estimates",
  receipts: "receipts",
  activity: "activity",
  project: "project details",
  checklist: "checklist",
  board: "board items",
  calendar: "calendar",
  "estimate-items": "estimate items",
};

export function useProjectRealtime(
  projectId: number | null,
  user: { id: string; firstName?: string | null; lastName?: string | null; role?: string; profileImageUrl?: string | null } | null | undefined
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [viewers, setViewers] = useState<ProjectViewer[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();
  const lastToastRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastPongRef = useRef<number>(Date.now());
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectRef = useRef<() => void>(() => {});

  const invalidateResources = useCallback((resources: string[], pid: number) => {
    for (const resource of resources) {
      switch (resource) {
        case "tasks":
          queryClient.invalidateQueries({ queryKey: ["/api/projects", pid, "tasks"] });
          queryClient.invalidateQueries({ queryKey: ["/api/milestones"] });
          break;
        case "milestones":
          queryClient.invalidateQueries({ queryKey: ["/api/projects", pid, "milestones"] });
          break;
        case "photos":
          queryClient.invalidateQueries({ queryKey: ["/api/projects", pid, "photos"] });
          break;
        case "documents":
          queryClient.invalidateQueries({ queryKey: ["/api/projects", pid, "documents"] });
          break;
        case "messages":
          queryClient.invalidateQueries({ queryKey: ["/api/projects", pid, "messages"] });
          break;
        case "estimates":
          queryClient.invalidateQueries({ queryKey: ["/api/projects", pid, "estimates"] });
          queryClient.invalidateQueries({ queryKey: ["/api/project-estimates"] });
          break;
        case "receipts":
          queryClient.invalidateQueries({ queryKey: ["/api/projects", pid, "receipts"] });
          break;
        case "activity":
          queryClient.invalidateQueries({ queryKey: ["/api/projects", pid, "activity"] });
          break;
        default:
          queryClient.invalidateQueries({ queryKey: ["/api/projects", pid, resource] });
          break;
      }
    }
  }, []);

  const forceReconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    setIsConnected(false);
    connectRef.current();
  }, []);

  const connect = useCallback(() => {
    if (!projectId || !user) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) return;

    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      lastPongRef.current = Date.now();
      ws.send(JSON.stringify({
        type: "project:join",
        projectId,
        userId: user.id,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        role: user.role || "",
        profileImageUrl: user.profileImageUrl || null,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "pong") {
          lastPongRef.current = Date.now();
          return;
        }

        switch (msg.type) {
          case "project:presence": {
            const otherUsers = (msg.users as ProjectViewer[]).filter((u) => u.userId !== user.id);
            setViewers(otherUsers);
            break;
          }

          case "project:update": {
            if (msg.resources && Array.isArray(msg.resources) && projectId) {
              const isOwnChange = msg.sourceUserId === user.id;
              invalidateResources(msg.resources, projectId);
              if (!isOwnChange) {
                const now = Date.now();
                if (now - lastToastRef.current > 3000) {
                  lastToastRef.current = now;
                  const labels = msg.resources
                    .map((r: string) => RESOURCE_LABELS[r] || r)
                    .join(", ");
                  const who = msg.sourceFirstName
                    ? `${msg.sourceFirstName} updated`
                    : "Someone updated";
                  toast({
                    title: "Live update",
                    description: `${who} ${labels}`,
                    duration: 3000,
                  });
                }
              }
            }
            break;
          }
        }
      } catch {}
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      setViewers([]);
      if (projectId) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [projectId, user, invalidateResources]);

  connectRef.current = connect;

  useEffect(() => {
    connect();

    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
        if (Date.now() - lastPongRef.current > 15000) {
          forceReconnect();
        }
      } else if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connect();
      }
    }, 5000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connect();
        } else {
          wsRef.current.send(JSON.stringify({ type: "ping" }));
          setTimeout(() => {
            if (Date.now() - lastPongRef.current > 6000) {
              forceReconnect();
            }
          }, 2000);
        }
      }
    };

    const handleOnline = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleVisibility);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "project:leave" }));
        }
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      setViewers([]);
    };
  }, [connect, forceReconnect]);

  return {
    viewers,
    isConnected,
  };
}
