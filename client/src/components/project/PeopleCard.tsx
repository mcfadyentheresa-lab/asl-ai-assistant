import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Pencil, Plus, UserPlus, Loader2, Users } from "lucide-react";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";

interface PeopleCardProps {
  project: any;
  users?: any[];
  userRole: string;
  planningBoards?: any[];
  setEditingUser: (u: any) => void;
  setProfileForm: (f: any) => void;
  setShowAddPerson: (open: boolean) => void;
  setAddPersonForm: (f: any) => void;
  projectId: number;
  toast: any;
}

export function PeopleCard({
  project, users, userRole, planningBoards,
  setEditingUser, setProfileForm, setShowAddPerson, setAddPersonForm,
  projectId, toast,
}: PeopleCardProps) {
  const admins = users?.filter((u: any) => u.role === "admin") || [];
  const crewMembers = users?.filter((u: any) => u.role === "crew") || [];
  const projectClients = users?.filter((u: any) => u.role === "client" && u.id === project.clientId) || [];
  const boardInvitedClients = Array.isArray(planningBoards)
    ? users?.filter((u: any) =>
        u.role === "client" && u.id !== project.clientId &&
        planningBoards.some((b: any) => (b.linkedUserIds || []).includes(u.id))
      ) || []
    : [];
  const allClients = [...projectClients, ...boardInvitedClients];

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteForm, setInviteForm] = useState({ firstName: "", lastName: "", email: "", phone: "" });

  const { data: projectInvites } = useQuery({
    queryKey: ["/api/projects", projectId, "invites"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/invites`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: userRole === "admin",
  });

  const inviteClientMutation = useMutation({
    mutationFn: async (data: typeof inviteForm) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/invite-client`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invite sent", description: "The client will receive an email with their portal link." });
      setShowInviteDialog(false);
      setInviteForm({ firstName: "", lastName: "", email: "", phone: "" });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "invites"] });
      qc.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to send invite", description: err.message, variant: "destructive" });
    },
  });

  const renderUserRow = (u: any, badge?: string) => (
    <div key={u.id} className={`flex items-center gap-2 ${u.archivedAt ? "opacity-50" : ""}`} data-testid={`people-user-${u.id}`}>
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback className="text-[10px]">
          {(u.firstName?.[0] || "").toUpperCase()}{(u.lastName?.[0] || "").toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">
            {u.firstName} {u.lastName}
          </span>
          {u.archivedAt && <Badge variant="outline" className="text-[9px] no-default-hover-elevate no-default-active-elevate">Archived</Badge>}
        </div>
        <div className="flex items-center gap-1">
          {u.email ? (
            <span className="text-xs text-muted-foreground truncate" data-testid={`text-email-${u.id}`}>{u.email}</span>
          ) : (
            <span className="text-xs text-muted-foreground/50">No email</span>
          )}
        </div>
      </div>
      {badge && <Badge variant="outline" className="text-[10px] flex-shrink-0">{badge}</Badge>}
      {userRole === "admin" && (
        <Button
          size="icon"
          variant="ghost"
          className="h-11 w-11 -m-2 shrink-0"
          data-testid={`button-edit-user-${u.id}`}
          onClick={() => {
            setEditingUser(u);
            setProfileForm({
              firstName: u.firstName || "",
              lastName: u.lastName || "",
              email: u.email || "",
              phone: u.phone || "",
              role: u.role || "client",
            });
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  const renderSegment = (
    label: string,
    members: any[],
    emptyHint: string,
    addCta: { label: string; onClick: () => void } | null,
    badgeFor?: (u: any) => string | undefined,
  ) => {
    const isEmpty = members.length === 0;
    return (
      <div className="space-y-2" data-testid={`people-segment-${label.toLowerCase()}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
            {label} <span className="tabular-nums">{members.length}</span>
          </span>
          {addCta && (
            <button
              type="button"
              onClick={addCta.onClick}
              className="inline-flex items-center justify-center h-11 w-11 -m-2 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label={addCta.label}
              data-testid={`button-${label.toLowerCase()}-add`}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
        {isEmpty ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span>{emptyHint}</span>
            {addCta && (
              <button
                type="button"
                onClick={addCta.onClick}
                className="text-primary hover:underline"
                data-testid={`button-${label.toLowerCase()}-inline-add`}
              >
                · {addCta.label}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {members.map((u: any) => renderUserRow(u, badgeFor?.(u)))}
          </div>
        )}
      </div>
    );
  };

  const showSection = (members: any[]) => members.length > 0 || userRole === "admin";

  if (userRole === "client") return null;

  return (
    <Card data-testid="card-people">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="font-sans text-base font-semibold flex items-center gap-2" data-testid="text-people-heading">
          <Users className="h-4 w-4 text-muted-foreground" />
          People
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 pt-0 space-y-5">
        {showSection(admins) && renderSegment(
          "Admins",
          admins,
          "No admins assigned",
          userRole === "admin"
            ? { label: "Add admin", onClick: () => { setShowAddPerson(true); setAddPersonForm({ firstName: "", lastName: "", email: "", phone: "", role: "admin" }); } }
            : null,
        )}
        {showSection(crewMembers) && renderSegment(
          "Crew",
          crewMembers,
          "No crew assigned",
          userRole === "admin"
            ? { label: "Invite crew", onClick: () => { setShowAddPerson(true); setAddPersonForm({ firstName: "", lastName: "", email: "", phone: "", role: "crew" }); } }
            : null,
        )}
        {showSection(allClients) && renderSegment(
          "Clients",
          allClients,
          "No client assigned",
          userRole === "admin"
            ? { label: "Invite client", onClick: () => setShowInviteDialog(true) }
            : null,
          (u: any) => u.id === project.clientId ? "Owner" : "Board invited",
        )}

        {Array.isArray(projectInvites) && projectInvites.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-border/60">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">Pending invites</span>
            {projectInvites.map((inv: any) => (
              <div key={inv.id} className="text-xs text-muted-foreground" data-testid={`pending-invite-${inv.id}`}>
                <span className="text-foreground">{inv.firstName} {inv.lastName}</span>
                <span className="ml-1.5">· {inv.email}</span>
              </div>
            ))}
          </div>
        )}

        {userRole === "admin" && (
          <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
            <DialogTrigger asChild>
              <span className="hidden" />
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-serif">Invite Client</DialogTitle>
                <DialogDescription>
                  The client will receive an email with a link to access their project portal.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="invite-first">First Name</Label>
                    <Input id="invite-first" value={inviteForm.firstName} onChange={(e) => setInviteForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" data-testid="input-invite-first" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="invite-last">Last Name</Label>
                    <Input id="invite-last" value={inviteForm.lastName} onChange={(e) => setInviteForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" data-testid="input-invite-last" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input id="invite-email" type="email" value={inviteForm.email} onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="client@example.com" data-testid="input-invite-email" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="invite-phone">Phone Number (optional)</Label>
                  <Input id="invite-phone" value={inviteForm.phone} onChange={(e) => setInviteForm(f => ({ ...f, phone: e.target.value }))} placeholder="Optional phone number" data-testid="input-invite-phone" />
                </div>
                <Button
                  className="w-full"
                  onClick={() => inviteClientMutation.mutate(inviteForm)}
                  disabled={inviteClientMutation.isPending || !inviteForm.firstName.trim() || !inviteForm.lastName.trim() || !inviteForm.email.trim()}
                  data-testid="button-send-invite"
                >
                  {inviteClientMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Send Invite
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
