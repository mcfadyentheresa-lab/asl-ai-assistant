import { useEffect, useRef, useCallback, useState } from "react";
import { useCanvasStore } from "@/stores/canvas-store";
import type { CanvasElement } from "@shared/schema";

interface BoardUser {
  userId: string;
  firstName: string;
  lastName: string;
  role: string;
  profileImageUrl: string | null;
}

interface CursorPosition {
  userId: string;
  firstName: string;
  lastName: string;
  x: number;
  y: number;
}

export function useBoardRealtime(
  boardId: number | null,
  user: { id: string; firstName?: string | null; lastName?: string | null; role?: string; profileImageUrl?: string | null } | null | undefined
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [collaborators, setCollaborators] = useState<BoardUser[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorPosition>>({});
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectedRef = useRef(false);

  const connect = useCallback(() => {
    if (!boardId || !user) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      isConnectedRef.current = true;
      ws.send(JSON.stringify({
        type: "join",
        boardId,
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
        const store = useCanvasStore.getState();

        switch (msg.type) {
          case "presence:update":
            setCollaborators(
              (msg.users as BoardUser[]).filter((u) => u.userId !== user.id)
            );
            break;

          case "element:add":
            if (msg.element) {
              store.addElement(msg.element as CanvasElement);
            }
            break;

          case "element:update":
            if (msg.elementId && msg.updates) {
              store.updateElement(msg.elementId, msg.updates);
            }
            break;

          case "element:remove":
            if (msg.elementId) {
              store.removeElement(msg.elementId);
            }
            break;

          case "element:move":
            if (msg.elementId != null && msg.x != null && msg.y != null) {
              store.moveElement(msg.elementId, msg.x, msg.y);
            }
            break;

          case "elements:positions":
            if (msg.updates && Array.isArray(msg.updates)) {
              msg.updates.forEach((u: any) => {
                const el = store.elements[u.id];
                if (el) {
                  store.updateElement(u.id, {
                    x: u.x,
                    y: u.y,
                    width: u.width,
                    height: u.height,
                    zIndex: u.zIndex,
                    parentColumnId: u.parentColumnId,
                  });
                }
              });
            }
            break;

          case "cursor:move":
            setCursors((prev) => ({
              ...prev,
              [msg.userId]: {
                userId: msg.userId,
                firstName: msg.firstName,
                lastName: msg.lastName,
                x: msg.x,
                y: msg.y,
              },
            }));
            break;
        }
      } catch (_err) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      isConnectedRef.current = false;
      wsRef.current = null;
      setCollaborators([]);
      setCursors({});
      if (boardId) {
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [boardId, user]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: "leave" }));
        wsRef.current.close();
        wsRef.current = null;
      }
      isConnectedRef.current = false;
      setCollaborators([]);
      setCursors({});
    };
  }, [connect]);

  const sendElementAdd = useCallback((element: CanvasElement) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "element:add", element }));
    }
  }, []);

  const sendElementUpdate = useCallback((elementId: number, updates: Partial<CanvasElement>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "element:update", elementId, updates }));
    }
  }, []);

  const sendElementRemove = useCallback((elementId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "element:remove", elementId }));
    }
  }, []);

  const sendElementMove = useCallback((elementId: number, x: number, y: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "element:move", elementId, x, y }));
    }
  }, []);

  const sendPositionsUpdate = useCallback((updates: { id: number; x: number; y: number; width: number; height: number; zIndex: number; parentColumnId: number | null }[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "elements:positions", updates }));
    }
  }, []);

  const sendCursorMove = useCallback((x: number, y: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cursor:move", x, y }));
    }
  }, []);

  return {
    collaborators,
    cursors,
    sendElementAdd,
    sendElementUpdate,
    sendElementRemove,
    sendElementMove,
    sendPositionsUpdate,
    sendCursorMove,
  };
}
