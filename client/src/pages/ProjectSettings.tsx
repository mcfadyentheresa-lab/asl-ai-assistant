import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useNotifyTeam } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail, Loader2, Check, Settings as SettingsIcon } from "lucide-react";

export default function ProjectSettings() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0", 10);
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: project } = useQuery<any>({
    queryKey: ["/api/projects/:id", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Project not found");
      return res.json();
    },
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch(`/api/users`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { mutate: notifyTeam, isPending: sendingNotification } = useNotifyTeam();

  const [notifyMessage, setNotifyMessage] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);

  const userRole = user?.role || "client";
  if (userRole !== "admin") {
    return (
      <div className="container max-w-3xl px-5 md:px-8 py-10">
        <p className="text-sm text-muted-foreground" data-testid="text-not-allowed">Settings are only available to admins.</p>
      </div>
    );
  }

  const eligibleRecipients = (users || []).filter(
    (u: any) => u.id !== user?.id && (u.role === "admin" || u.role === "crew" || (u.role === "client" && u.id === project?.clientId))
  );

  const toggleRecipient = (id: string) => {
    setSelectedRecipients((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]);
  };
  const selectAll = () => {
    if (selectedRecipients.length === eligibleRecipients.length) {
      setSelectedRecipients([]);
    } else {
      setSelectedRecipients(eligibleRecipients.map((u: any) => u.id));
    }
  };

  return (
    <div className="container max-w-3xl px-5 md:px-8 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/project/${projectId}`} className="inline-flex items-center text-[11px] text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-project">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> {project?.name || "Project"}
        </Link>
        <span className="text-border/80">·</span>
        <h1 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2" data-testid="text-settings-heading">
          <SettingsIcon className="h-4 w-4 text-muted-foreground" />
          Settings
        </h1>
      </div>

      <Card data-testid="card-email-notifications">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="font-sans text-base font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Email Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-4">
          <p className="text-xs text-muted-foreground">
            Send a one-off email to team members and the project client. Used for ad-hoc updates.
          </p>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Send to</span>
              <Button variant="ghost" size="sm" className="h-11 px-2 text-xs" onClick={selectAll} data-testid="button-select-all-recipients">
                {selectedRecipients.length === eligibleRecipients.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="recipient-list">
              {eligibleRecipients.map((u: any) => {
                const selected = selectedRecipients.includes(u.id);
                const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                const hasEmail = !!u.email;
                return (
                  <Button
                    key={u.id}
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    disabled={!hasEmail}
                    className={`text-xs toggle-elevate ${selected ? "toggle-elevated" : ""}`}
                    onClick={() => toggleRecipient(u.id)}
                    data-testid={`recipient-toggle-${u.id}`}
                  >
                    {selected && <Check className="h-3 w-3 mr-1" />}
                    {name}
                    <span className="ml-1 opacity-60">({u.role})</span>
                    {!hasEmail && <span className="ml-1 opacity-60">- no email</span>}
                  </Button>
                );
              })}
              {eligibleRecipients.length === 0 && (
                <p className="text-xs text-muted-foreground">No eligible recipients on this project yet.</p>
              )}
            </div>
          </div>
          <Textarea
            value={notifyMessage}
            onChange={(e) => setNotifyMessage(e.target.value.slice(0, 1000))}
            placeholder="Type a message to send by email..."
            className="text-sm min-h-[100px]"
            data-testid="input-notify-message"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-muted-foreground">{notifyMessage.length}/1000</span>
            <Button
              size="sm"
              className="h-11 px-4"
              disabled={sendingNotification || !notifyMessage.trim() || selectedRecipients.length === 0}
              data-testid="button-send-notify"
              onClick={() => {
                notifyTeam(
                  { projectId, message: notifyMessage.trim(), recipientIds: selectedRecipients },
                  {
                    onSuccess: (data: any) => {
                      toast({ title: "Notification sent", description: data.message });
                      setNotifyMessage("");
                      setSelectedRecipients([]);
                    },
                    onError: (err: any) => toast({ title: "Failed to notify", description: err.message, variant: "destructive" }),
                  }
                );
              }}
            >
              {sendingNotification ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Mail className="h-3.5 w-3.5 mr-1.5" />}
              Send {selectedRecipients.length > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px]">{selectedRecipients.length}</Badge>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
