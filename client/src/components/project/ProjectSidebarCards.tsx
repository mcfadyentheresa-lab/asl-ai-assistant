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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  UserPlus, Mail, Phone, Pencil, Plus, Send, Check, ChevronRight, Shield, Loader2, ChevronDown,
} from "lucide-react";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

export function ProjectSidebarCards({
  project, user, users, userRole, onlineUsers, planningBoards, assignedClient,
  activityLog, seenLocally, toast, updateProject, sendTestSms, sendingTestSms,
  notifyTeam, sendingNotification, showNotifyForm, setShowNotifyForm,
  notifyMessage, setNotifyMessage, selectedRecipients, setSelectedRecipients,
  setEditingUser, setProfileForm, setShowAddPerson, setAddPersonForm, setActiveTab, projectId,
}: any) {
  const admins = users?.filter((u: any) => u.role === "admin") || [];
  const crewMembers = users?.filter((u: any) => u.role === "crew") || [];
  const clients = users?.filter((u: any) => u.role === "client" && u.id === project.clientId) || [];
  const boardInvitedClients = Array.isArray(planningBoards) ? users?.filter((u: any) =>
    u.role === "client" && u.id !== project.clientId &&
    planningBoards.some((b: any) => (b.linkedUserIds || []).includes(u.id))
  ) || [] : [];
  const allClients = [...clients, ...boardInvitedClients];

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

  const resendInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/invites/${inviteId}/resend`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Invite resent",
        description: data?.emailSent
          ? "The client will receive another email with their portal link."
          : data?.smsSent
            ? "The client will receive another text message with their portal link."
            : "Invite resent.",
      });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "invites"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to resend invite", description: err.message, variant: "destructive" });
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      const res = await apiRequest("DELETE", `/api/projects/${projectId}/invites/${inviteId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invite deleted", description: "The invite has been removed." });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "invites"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete invite", description: err.message, variant: "destructive" });
    },
  });

  const renderUserRow = (u: any, badge?: string) => (
    <div key={u.id} className={`space-y-1 ${u.archivedAt ? "opacity-50" : ""}`} data-testid={`access-user-${u.id}`}>
      <div className="flex items-center gap-2">
        <div className="relative flex-shrink-0">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px]">
              {(u.firstName?.[0] || "").toUpperCase()}{(u.lastName?.[0] || "").toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm truncate block">
            {u.firstName} {u.lastName}
            {u.archivedAt && <Badge variant="outline" className="ml-1 text-[9px] no-default-hover-elevate no-default-active-elevate">Archived</Badge>}
          </span>
          <div className="flex items-center gap-1">
            {u.phone ? (
              <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-phone-${u.id}`}>
                <Phone className="h-3 w-3" />{u.phone}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/50 italic">No phone</span>
            )}
            {userRole === "admin" && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 ml-1"
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
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        {badge && <Badge variant="outline" className="ml-auto text-[10px] flex-shrink-0">{badge}</Badge>}
      </div>
    </div>
  );

  const copyInviteLink = async (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(link);
    toast({ title: "Copied", description: "Invite link copied to clipboard." });
  };

  const [activityExpanded, setActivityExpanded] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const missedEntries = activityLog?.filter((e: any) =>
    e.userId !== user?.id && !e.views?.some((v: any) => v.userId === user?.id) && !seenLocally.has(e.id)
  ) || [];
  const seenEntries = activityLog?.filter((e: any) =>
    e.userId === user?.id || e.views?.some((v: any) => v.userId === user?.id) || seenLocally.has(e.id)
  ) || [];

  const typeStyles: Record<string, { dot: string; tab: string | null; label: string }> = {
    milestone_created: { dot: "bg-blue-500", tab: "checklist", label: "View Progress" },
    photo_uploaded: { dot: "bg-emerald-500", tab: "photos", label: "View Photos" },
    document_uploaded: { dot: "bg-amber-500", tab: "docs", label: "View Documents" },
    notification_sent: { dot: "bg-purple-500", tab: null, label: "" },
    message_sent: { dot: "bg-sky-500", tab: "chat", label: "View Chat" },
    calendar_event_created: { dot: "bg-rose-500", tab: "calendar", label: "View Calendar" },
    task_created: { dot: "bg-teal-500", tab: "checklist", label: "View Progress" },
  };

  return (
    <>
      {userRole === "admin" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-base" data-testid="text-client-heading">
              Assigned Client
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {!assignedClient && (
              <p className="text-muted-foreground text-sm" data-testid="text-no-client">No client assigned</p>
            )}

            <div className="space-y-2">
              <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2 rounded-xl border-border/70 bg-background/70 px-4 py-3.5" data-testid="button-invite-client">
                    <UserPlus className="h-4 w-4" />
                    Invite New Client
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-serif">Invite Client</DialogTitle>
                    <DialogDescription>
                      The client will receive an email with a link to access their project portal. SMS can be used as a backup.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="invite-first">First Name</Label>
                        <Input id="invite-first" value={inviteForm.firstName} onChange={(e) => setInviteForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Theresa" data-testid="input-invite-first" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="invite-last">Last Name</Label>
                        <Input id="invite-last" value={inviteForm.lastName} onChange={(e) => setInviteForm(f => ({ ...f, lastName: e.target.value }))} placeholder="McFadyen" data-testid="input-invite-last" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="invite-email">Email</Label>
                      <Input id="invite-email" type="email" value={inviteForm.email} onChange={(e) => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="client@example.com" data-testid="input-invite-email" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="invite-phone">Phone Number (optional)</Label>
                      <Input id="invite-phone" value={inviteForm.phone} onChange={(e) => setInviteForm(f => ({ ...f, phone: e.target.value }))} placeholder="(705) 555-0123" data-testid="input-invite-phone" />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => inviteClientMutation.mutate(inviteForm)}
                        disabled={inviteClientMutation.isPending || !inviteForm.firstName.trim() || !inviteForm.lastName.trim() || !inviteForm.email.trim()}
                        data-testid="button-send-invite"
                      >
                        {inviteClientMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                        Send Invite
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {Array.isArray(projectInvites) && projectInvites.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.18em]">Invites</p>
                  {projectInvites.map((inv: any) => (
                    <div key={inv.id} className="rounded-xl border border-border/60 bg-background/60 p-2.5 space-y-1.5" data-testid={`invite-row-${inv.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-sm text-foreground">{inv.firstName} {inv.lastName}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground truncate">{inv.email}{inv.phone ? ` • ${inv.phone}` : ""}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => copyInviteLink(inv.token)}
                          data-testid={`button-copy-invite-link-${inv.id}`}
                        >
                          Copy link
                        </Button>
                        {inv.status !== "accepted" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => resendInviteMutation.mutate(inv.id)}
                            disabled={resendInviteMutation.isPending}
                            data-testid={`button-resend-invite-${inv.id}`}
                          >
                            Resend
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2.5 text-xs text-destructive hover:text-destructive"
                          onClick={() => deleteInviteMutation.mutate(inv.id)}
                          disabled={deleteInviteMutation.isPending}
                          data-testid={`button-delete-invite-${inv.id}`}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {userRole === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg flex items-center gap-2" data-testid="text-access-heading">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Project Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div data-testid="access-group-admin">
              <button
                className="flex items-center gap-1.5 w-full text-left cursor-pointer select-none"
                onClick={() => setExpandedGroups(prev => {
                  const next = new Set(prev);
                  next.has("admin") ? next.delete("admin") : next.add("admin");
                  return next;
                })}
                data-testid="button-toggle-admins"
              >
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${expandedGroups.has("admin") ? "rotate-90" : ""}`} />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Admins ({admins.length})</span>
              </button>
              {expandedGroups.has("admin") && (
                <div className="space-y-3 mt-2 ml-5">
                  {admins.map((u: any) => renderUserRow(u, "Full access"))}
                </div>
              )}
            </div>
            <div data-testid="access-group-crew">
              <button
                className="flex items-center gap-1.5 w-full text-left cursor-pointer select-none"
                onClick={() => setExpandedGroups(prev => {
                  const next = new Set(prev);
                  next.has("crew") ? next.delete("crew") : next.add("crew");
                  return next;
                })}
                data-testid="button-toggle-crew"
              >
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${expandedGroups.has("crew") ? "rotate-90" : ""}`} />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Crew ({crewMembers.length})</span>
              </button>
              {expandedGroups.has("crew") && (
                <div className="space-y-3 mt-2 ml-5">
                  {crewMembers.length > 0 ? crewMembers.map((u: any) => renderUserRow(u)) : (
                    <p className="text-xs text-muted-foreground italic">No crew assigned</p>
                  )}
                </div>
              )}
            </div>
            <div data-testid="access-group-client">
              <button
                className="flex items-center gap-1.5 w-full text-left cursor-pointer select-none"
                onClick={() => setExpandedGroups(prev => {
                  const next = new Set(prev);
                  next.has("client") ? next.delete("client") : next.add("client");
                  return next;
                })}
                data-testid="button-toggle-clients"
              >
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${expandedGroups.has("client") ? "rotate-90" : ""}`} />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Clients ({allClients.length})</span>
              </button>
              {expandedGroups.has("client") && (
                <div className="space-y-3 mt-2 ml-5">
                  {allClients.length > 0 ? allClients.map((u: any) =>
                    renderUserRow(u, u.id === project.clientId ? "Project owner" : "Board invited")
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No client assigned</p>
                  )}
                </div>
              )}
            </div>
            {userRole === "admin" && (
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-add-person"
                  onClick={() => {
                    setShowAddPerson(true);
                    setAddPersonForm({ firstName: "", lastName: "", email: "", phone: "", role: "crew" });
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Person
                </Button>
              </div>
            )}
            {userRole === "admin" && (
              <div className="pt-2 border-t space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">SMS Notifications</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="button-notify-team"
                    onClick={() => setShowNotifyForm(!showNotifyForm)}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    Notify Team
                  </Button>
                  {userRole === "admin" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={sendingTestSms}
                      data-testid="button-send-test-sms"
                      onClick={() => {
                        const adminUser = users?.find((u: any) => u.id === user?.id);
                        const phone = adminUser?.phone;
                        if (!phone) {
                          toast({ title: "No phone number", description: "Add your phone number first to receive a test SMS", variant: "destructive" });
                          return;
                        }
                        sendTestSms(phone, {
                          onSuccess: () => toast({ title: "Test SMS sent", description: `Sent to ${phone}` }),
                          onError: (err: any) => toast({ title: "SMS failed", description: err.message, variant: "destructive" }),
                        });
                      }}
                    >
                      {sendingTestSms ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Phone className="h-3 w-3 mr-1" />}
                      Test SMS
                    </Button>
                  )}
                </div>
                {showNotifyForm && (() => {
                  const eligibleRecipients = (users || []).filter(
                    (u: any) => u.id !== user?.id && (u.role === "admin" || u.role === "crew" || (u.role === "client" && u.id === project?.clientId))
                  );
                  const toggleRecipient = (id: string) => {
                    setSelectedRecipients((prev: string[]) =>
                      prev.includes(id) ? prev.filter((r: string) => r !== id) : [...prev, id]
                    );
                  };
                  const selectAll = () => {
                    if (selectedRecipients.length === eligibleRecipients.length) {
                      setSelectedRecipients([]);
                    } else {
                      setSelectedRecipients(eligibleRecipients.map((u: any) => u.id));
                    }
                  };
                  return (
                    <div className="space-y-3" data-testid="notify-team-form">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Send to:</span>
                          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={selectAll} data-testid="button-select-all-recipients">
                            {selectedRecipients.length === eligibleRecipients.length ? "Deselect All" : "Select All"}
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5" data-testid="recipient-list">
                          {eligibleRecipients.map((u: any) => {
                            const selected = selectedRecipients.includes(u.id);
                            const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email;
                            const hasPhone = !!u.phone;
                            return (
                              <Button
                                key={u.id}
                                variant={selected ? "default" : "outline"}
                                size="sm"
                                disabled={!hasPhone}
                                className={`text-xs toggle-elevate ${selected ? "toggle-elevated" : ""}`}
                                onClick={() => toggleRecipient(u.id)}
                                data-testid={`recipient-toggle-${u.id}`}
                              >
                                {selected && <Check className="h-3 w-3 mr-1" />}
                                {name}
                                <span className="ml-1 opacity-60">({u.role})</span>
                                {!hasPhone && <span className="ml-1 opacity-60">- no phone</span>}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                      <Textarea
                        value={notifyMessage}
                        onChange={(e) => setNotifyMessage(e.target.value.slice(0, 300))}
                        placeholder="Type a message to send via SMS..."
                        className="text-sm min-h-[60px]"
                        data-testid="input-notify-message"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{notifyMessage.length}/300</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setShowNotifyForm(false); setNotifyMessage(""); setSelectedRecipients([]); }}
                            data-testid="button-cancel-notify"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
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
                                    setShowNotifyForm(false);
                                  },
                                  onError: (err: any) => toast({ title: "Failed to notify", description: err.message, variant: "destructive" }),
                                }
                              );
                            }}
                          >
                            {sendingNotification ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                            Send ({selectedRecipients.length})
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-recent-activity">
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setActivityExpanded(prev => !prev)}
        >
          <CardTitle className="font-serif text-lg flex items-center gap-2 flex-wrap" data-testid="text-activity-heading">
            Recent Activity
            {missedEntries.length > 0 && (
              <Badge variant="destructive" className="text-[10px]" data-testid="badge-missed-count">
                {missedEntries.length} new
              </Badge>
            )}
            <ChevronDown className={`h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200 ${activityExpanded ? 'rotate-0' : '-rotate-90'}`} />
          </CardTitle>
        </CardHeader>
        {activityExpanded && (
        <CardContent onClick={(e) => e.stopPropagation()}>
          <div className="space-y-4">
            {missedEntries.length > 0 && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" data-testid="text-missed-label">Missed while you were away</p>
                {missedEntries.slice(0, 10).map((entry: any) => {
                  const style = typeStyles[entry.type] || { dot: "bg-muted-foreground", tab: null, label: "" };
                  const timeAgo = entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : "";
                  const isClickable = !!style.tab;
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-3 text-sm pb-3 border-b last:border-0 last:pb-0 rounded-sm bg-primary/5 p-2 -mx-2 ${isClickable ? "cursor-pointer hover-elevate" : ""}`}
                      data-testid={`activity-missed-${entry.id}`}
                      onClick={isClickable ? () => setActiveTab(style.tab!) : undefined}
                      role={isClickable ? "button" : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                    >
                      <div className="relative mt-1 flex-shrink-0">
                        <div className={`h-2 w-2 rounded-full ${style.dot}`} />
                        <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-destructive" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground">{entry.title}</p>
                          <Badge variant="outline" className="text-[9px] py-0 px-1 border-destructive/40 text-destructive" data-testid={`badge-new-${entry.id}`}>NEW</Badge>
                        </div>
                        {entry.description && (
                          <p className="text-muted-foreground text-xs truncate">{entry.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-muted-foreground text-xs">{timeAgo}</span>
                          {isClickable && (
                            <span className="text-xs text-primary/70">{style.label}</span>
                          )}
                        </div>
                      </div>
                      {isClickable && <ChevronRight className="h-3.5 w-3.5 mt-1 text-muted-foreground flex-shrink-0" />}
                    </div>
                  );
                })}
                {seenEntries.length > 0 && (
                  <Separator className="my-2" />
                )}
              </>
            )}
            {seenEntries.length > 0 && (
              <>
                {missedEntries.length > 0 && (
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" data-testid="text-earlier-label">Earlier</p>
                )}
                {seenEntries.slice(0, 8).map((entry: any) => {
                  const style = typeStyles[entry.type] || { dot: "bg-muted-foreground", tab: null, label: "" };
                  const timeAgo = entry.createdAt ? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true }) : "";
                  const isClickable = !!style.tab;
                  return (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-3 text-sm pb-3 border-b last:border-0 last:pb-0 ${isClickable ? "cursor-pointer hover-elevate rounded-sm p-1 -mx-1" : ""}`}
                      data-testid={`activity-seen-${entry.id}`}
                      onClick={isClickable ? () => setActiveTab(style.tab!) : undefined}
                      role={isClickable ? "button" : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                    >
                      <div className={`h-2 w-2 mt-1.5 rounded-full ${style.dot} flex-shrink-0`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground">{entry.title}</p>
                        {entry.description && (
                          <p className="text-muted-foreground text-xs truncate">{entry.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-muted-foreground text-xs">{timeAgo}</span>
                          {isClickable && (
                            <span className="text-xs text-primary/70">{style.label}</span>
                          )}
                        </div>
                      </div>
                      {isClickable && <ChevronRight className="h-3.5 w-3.5 mt-1 text-muted-foreground flex-shrink-0" />}
                    </div>
                  );
                })}
              </>
            )}
            {missedEntries.length === 0 && seenEntries.length === 0 && (
              <p className="text-muted-foreground text-sm" data-testid="text-no-activity">No recent activity</p>
            )}
          </div>
        </CardContent>
        )}
      </Card>
    </>
  );
}
