import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "./use-auth";

interface OnlineUser {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  profileImageUrl: string | null;
}

const HEARTBEAT_INTERVAL = 30_000;
const POLL_INTERVAL = 15_000;

export function usePresenceHeartbeat() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    const sendHeartbeat = () => {
      fetch("/api/presence/heartbeat", {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    };

    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id]);
}

export function useOnlineUsers() {
  return useQuery<OnlineUser[]>({
    queryKey: ["/api/presence/online"],
    queryFn: async () => {
      const res = await fetch("/api/presence/online", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: POLL_INTERVAL,
  });
}

export function useVisibilityToggle() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    fetch("/api/presence/visibility", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setVisible(data.visible))
      .catch(() => {});
  }, []);

  const toggle = useMutation({
    mutationFn: async (newVisible: boolean) => {
      const res = await fetch("/api/presence/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: newVisible }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update visibility");
      return res.json();
    },
    onSuccess: (data) => {
      setVisible(data.visible);
    },
  });

  return { visible, toggleVisibility: () => toggle.mutate(!visible), isPending: toggle.isPending };
}

export function isUserOnline(onlineUsers: OnlineUser[] | undefined, userId: string): boolean {
  if (!onlineUsers) return false;
  return onlineUsers.some((u) => u.userId === userId);
}
