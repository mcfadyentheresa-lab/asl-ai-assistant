import { useParams, Link } from "wouter";
import { queryClient } from "@/lib/queryClient";
import {
  useProject, useMilestones, useTasks, useMessages, useSendMessage,
  useChecklistItems, useCreateChecklistItem, useUpdateChecklistItem, useDeleteChecklistItem,
  useBoardItems, useCreateBoardItem, useDeleteBoardItem,
  useCreateCalendarEvent,
  useDocuments, useUploadDocument, useDeleteDocument,
  usePhotos, useCreatePhoto, useDeletePhoto, useUploadImage,
  useUsers, useUpdateProject, usePlanningBoards, useUpdateUserPhone, useNotifyTeam,
  useActivityLog, useUpdateMilestone, useSections, useCreateMilestone, useCreateTask,
} from "@/hooks/use-projects";
import { useOnlineUsers } from "@/hooks/use-presence";
import { useViewMode } from "@/hooks/use-view-mode";
import { useProjectRealtime } from "@/hooks/use-project-realtime";
import { Navbar } from "@/components/layout/Navbar";
import SpatialCanvas from "@/components/SpatialCanvas";
import { FurniturePlannerPanel } from "@/pages/TableRedesignPlanner";
import { Loader2, Clock, FileText, ImageIcon, MessageSquare, ArrowLeft, Send, Trash2, CheckSquare, LayoutGrid, Plus, ChevronDown, ChevronRight, Link2, StickyNote, Pencil, CalendarIcon, Upload, Download, X, Paperclip, ZoomIn, Palette, Check, Archive, ArchiveRestore, PanelRightOpen, MoreVertical, Flag, BarChart3, ArrowUpRight, Building2, Sparkles, Armchair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useRecentProjects } from "@/hooks/use-recent-projects";
import { format } from "date-fns";
import { ProjectProgressSummary } from "@/components/project/ProjectProgressSummary";
import { BudgetSnapshot } from "@/components/project/BudgetSnapshot";
import { ProjectSidebarCards } from "@/components/project/ProjectSidebarCards";
import { ProgressTab } from "@/components/project/ProgressTab";
import type { ChecklistItem, BoardItem } from "@shared/schema";

export default function ProjectDetails() {
  const { id } = useParams();
  const projectId = Number(id);
  const { data: project, isLoading: loadingProject } = useProject(projectId);
  const { data: milestones } = useMilestones(projectId);
  const { data: sections } = useSections(projectId);
  const { data: tasks } = useTasks(projectId);
  const { data: activityLog } = useActivityLog(projectId);
  const { user } = useAuth();
  const { data: users } = useUsers();
  const { mutate: updateProject } = useUpdateProject();
  const { mutate: _updateMilestone } = useUpdateMilestone();
  const { mutate: _updatePhone } = useUpdateUserPhone();
  const { mutate: notifyTeam, isPending: sendingNotification } = useNotifyTeam();
  const { data: onlineUsers } = useOnlineUsers();
  const { viewers } = useProjectRealtime(projectId, user);
  const { toast } = useToast();
  const { trackProject } = useRecentProjects();
  const heroFileInputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: uploadHeroImage, isPending: isUploadingHero } = useUploadImage();

  useEffect(() => {
    if (project && user?.role !== "client") {
      trackProject({ id: project.id, name: project.name });
    }
  }, [project?.id, project?.name, user?.role]);

  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "planning") return "board";
    if (tab === "calendar") return "calendar";
    if (tab === "checklist") return "checklist";
    if (tab === "photos") return "photos";
    if (tab === "documents") return "documents";
    const cachedRole = localStorage.getItem("userRole");
    if (cachedRole === "admin" || cachedRole === "crew") return "checklist";
    return "overview";
  });
  const [_editingPhoneUserId, _setEditingPhoneUserId] = useState<string | null>(null);
  const [_phoneInput, _setPhoneInput] = useState("");
  const [showNotifyForm, setShowNotifyForm] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [profileForm, setProfileForm] = useState({ firstName: "", lastName: "", email: "", phone: "", role: "" });
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [addPersonForm, setAddPersonForm] = useState({ firstName: "", lastName: "", email: "", phone: "", role: "crew" });
  const [addingPerson, setAddingPerson] = useState(false);
  const [showOpenItemsDrawer, setShowOpenItemsDrawer] = useState(false);
  const [progressSubTab, setProgressSubTab] = useState<"gantt" | "calendar">("gantt");
  const { data: planningBoards } = usePlanningBoards(projectId);
  const assignedClient = users?.find((u) => u.id === project?.clientId);

  const { viewMode } = useViewMode();
  const actualRole = user?.role || "client";
  const userRole = actualRole === "admin" ? viewMode : actualRole;

  const [seenLocally, setSeenLocally] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (activeTab !== "overview" || !activityLog || !user?.id) return;
    const unviewed = activityLog.filter((e: any) =>
      e.userId !== user.id && !e.views?.some((v: any) => v.userId === user.id)
    );
    if (unviewed.length === 0) return;
    const timer = setTimeout(() => {
      for (const entry of unviewed) {
        fetch(`/api/activity/${entry.id}/view`, { method: "POST", credentials: "include" }).catch(() => {});
      }
      setSeenLocally((prev) => {
        const next = new Set(prev);
        unviewed.forEach((e: any) => next.add(e.id));
        return next;
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeTab, activityLog, user?.id]);



  const isClientInvitedToBoard = userRole === "client" && Array.isArray(planningBoards) &&
    planningBoards.some((b: any) => (b.linkedUserIds || []).includes(user?.id));

  type TabConfig = {
    id: string;
    label: string;
    icon: any;
    roles: string[];
    clientRequiresInvite?: boolean;
  };

  const tabConfig: TabConfig[] = [
    { id: "overview", label: "Overview", icon: Clock, roles: ["admin", "crew", "client"] },
    { id: "checklist", label: "Progress", icon: BarChart3, roles: ["admin", "crew", "client"] },
    { id: "photos", label: "Photos", icon: ImageIcon, roles: ["admin", "crew", "client"] },
    { id: "docs", label: "Documents", icon: FileText, roles: ["admin", "client"] },
    { id: "chat", label: "Messages", icon: MessageSquare, roles: ["admin", "crew", "client"] },
    { id: "board", label: "Planning Board", icon: Palette, roles: ["admin", "crew", "client"], clientRequiresInvite: true },
    { id: "furniture", label: "Furniture", icon: Armchair, roles: ["admin"] },
  ];

  const canViewTab = (tab: TabConfig) => {
    if (!tab.roles.includes(userRole)) return false;
    if (tab.clientRequiresInvite && userRole === "client" && !isClientInvitedToBoard) return false;
    return true;
  };

  const visibleTabs = tabConfig.filter(canViewTab);

  const safeActiveTab = visibleTabs.find(t => t.id === activeTab) ? activeTab : (visibleTabs[0]?.id || "overview");

  if (loadingProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loader-project" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <h1 className="font-serif text-2xl font-bold text-foreground" data-testid="text-not-found">Project not found</h1>
        <Link href="/">
          <Button data-testid="button-go-home">Go Home</Button>
        </Link>
      </div>
    );
  }

  const statusLabel: Record<string, string> = {
    planning: "Planning",
    in_progress: "In Progress",
    completed: "Completed",
    archived: "Archived",
  };

  const isAdminUser = user?.role === "admin";

  const handleHeroFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 10 MB.", variant: "destructive" });
      return;
    }
    try {
      const { url } = await uploadHeroImage(file);
      updateProject(
        { id: project.id, data: { thumbnailUrl: url } },
        {
          onSuccess: () => toast({ title: "Main image updated" }),
          onError: (err: any) =>
            toast({ title: "Couldn't save image", description: err.message, variant: "destructive" }),
        },
      );
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveHero = () => {
    updateProject(
      { id: project.id, data: { thumbnailUrl: null } },
      {
        onSuccess: () => toast({ title: "Main image removed" }),
        onError: (err: any) =>
          toast({ title: "Couldn't remove image", description: err.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className={`min-h-screen bg-background ${safeActiveTab === "board" ? "h-[100dvh] flex flex-col overflow-hidden" : "pb-20"}`}>
      <Navbar />

      {/* Project hero image (above header). Renders if set; admins can upload/replace/remove. */}
      {(project.thumbnailUrl || isAdminUser) && (
        <div
          className="w-full bg-muted/30 border-b border-border/60 relative group"
          data-testid="project-hero-image"
        >
          {project.thumbnailUrl ? (
            <div className="w-full aspect-[4/1] md:aspect-[5/1] overflow-hidden">
              <img
                src={project.thumbnailUrl}
                alt={project.name}
                className="w-full h-full object-cover"
                data-testid="img-project-hero"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => heroFileInputRef.current?.click()}
              disabled={isUploadingHero}
              className="w-full aspect-[5/1] md:aspect-[6/1] flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-60"
              data-testid="btn-upload-hero-empty"
            >
              {isUploadingHero ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="h-4 w-4" />
              )}
              <span className="text-xs">
                {isUploadingHero ? "Uploading\u2026" : "Add main project image"}
              </span>
            </button>
          )}

          {isAdminUser && project.thumbnailUrl && (
            <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => heroFileInputRef.current?.click()}
                disabled={isUploadingHero}
                className="h-7 px-2 text-[11px]"
                data-testid="btn-replace-hero"
              >
                {isUploadingHero ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3 w-3 mr-1" />
                )}
                Replace
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleRemoveHero}
                className="h-7 px-2 text-[11px]"
                data-testid="btn-remove-hero"
              >
                <X className="h-3 w-3 mr-1" />
                Remove
              </Button>
            </div>
          )}

          {isAdminUser && (
            <input
              ref={heroFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleHeroFileChosen}
              className="hidden"
              data-testid="input-hero-file"
            />
          )}
        </div>
      )}

      <div className="w-full border-b border-border/60 bg-background/90 backdrop-blur-sm" data-testid="project-hero">
        <div className="container px-5 md:px-8 py-4">
          <Link href="/" className="inline-flex items-center text-[11px] text-muted-foreground mb-2 transition-colors hover:text-foreground" onClick={() => window.sessionStorage.setItem("aster-spruce:last-planning-board", String(projectId))} data-testid="link-back">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Dashboard
          </Link>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center flex-wrap gap-2">
                <h1 className="font-serif text-xl md:text-2xl font-bold text-foreground leading-tight" data-testid="text-project-title">
                  {project.name}
                </h1>
                <Badge variant="secondary" className="text-[10px]" data-testid="badge-project-status">
                  {statusLabel[project.status] || project.status}
                </Badge>
                {viewers.length > 0 && (
                  <div className="flex items-center gap-1 ml-1" data-testid="active-viewers">
                    <div className="flex -space-x-1.5">
                      {viewers.map(v => (
                        <div key={v.userId} className="w-6 h-6 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-[10px] font-medium" title={`${v.firstName} ${v.lastName}`} data-testid={`viewer-avatar-${v.userId}`}>
                          {v.profileImageUrl ? (
                            <img src={v.profileImageUrl} className="w-full h-full rounded-full object-cover" alt={`${v.firstName} ${v.lastName}`} />
                          ) : (
                            <span>{(v.firstName?.[0] || '') + (v.lastName?.[0] || '')}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground" data-testid="text-viewer-count">{viewers.length} viewing</span>
                  </div>
                )}
              </div>
              {project.description && (
                <p className="text-muted-foreground max-w-2xl text-xs" data-testid="text-project-desc">
                  {project.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className={`container px-5 md:px-8 ${safeActiveTab === "board" ? "mt-0 flex flex-col flex-1 min-h-0" : "mt-4"}`} id="project-main">
        <Tabs value={safeActiveTab} onValueChange={setActiveTab} className={safeActiveTab === "board" ? "space-y-1 flex flex-col flex-1 min-h-0" : "space-y-4"}>
          <div className={`overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0 ${safeActiveTab === "board" ? "mobile-landscape:hidden" : ""}`}>
            <TabsList className="w-max md:w-auto h-8 p-0.5 gap-0.5" data-testid="tabs-list">
              {visibleTabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="h-7 px-2.5 text-[11px] md:text-xs gap-1.5" data-testid={`tab-${tab.id}`}>
                  <tab.icon className="h-3 w-3" />
                  <span className="hidden md:inline font-medium">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-8">
            {userRole === "client" ? (
              <div className="space-y-5">
                <ProjectProgressSummary
                  projectId={projectId}
                  milestones={milestones}
                  userRole={userRole}
                  onNavigateToTimeline={() => setActiveTab("checklist")}
                />
                <button
                  onClick={() => setShowOpenItemsDrawer(true)}
                  className="text-xs text-primary hover:underline cursor-pointer -mt-1 block"
                  data-testid="link-view-open-items"
                >
                  View open items →
                </button>
                <div className="space-y-6">
                  <BudgetSnapshot projectId={projectId} userRole={userRole} />
                  <ProjectSidebarCards
                    project={project}
                    user={user}
                    users={users}
                    userRole={userRole}
                    onlineUsers={onlineUsers}
                    planningBoards={planningBoards}
                    assignedClient={assignedClient}
                    activityLog={activityLog}
                    seenLocally={seenLocally}
                    toast={toast}
                    updateProject={updateProject}
                    notifyTeam={notifyTeam}
                    sendingNotification={sendingNotification}
                    showNotifyForm={showNotifyForm}
                    setShowNotifyForm={setShowNotifyForm}
                    notifyMessage={notifyMessage}
                    setNotifyMessage={setNotifyMessage}
                    selectedRecipients={selectedRecipients}
                    setSelectedRecipients={setSelectedRecipients}
                    setEditingUser={setEditingUser}
                    setProfileForm={setProfileForm}
                    setShowAddPerson={setShowAddPerson}
                    setAddPersonForm={setAddPersonForm}
                    setActiveTab={setActiveTab}
                    projectId={projectId}
                  />
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-5">
                  <ProjectProgressSummary
                    projectId={projectId}
                    milestones={milestones}
                    userRole={userRole}
                    onNavigateToTimeline={() => setActiveTab("checklist")}
                  />
                  <button
                    onClick={() => setShowOpenItemsDrawer(true)}
                    className="text-xs text-primary hover:underline cursor-pointer -mt-1 block"
                    data-testid="link-view-open-items"
                  >
                    View open items →
                  </button>
                </div>

                <div className="md:hidden mb-4">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full" data-testid="button-open-sidebar-drawer">
                        <PanelRightOpen className="h-4 w-4 mr-2" />
                        Project Details
                        {(() => {
                          const missedCount = activityLog?.filter((e: any) =>
                            e.userId !== user?.id && !e.views?.some((v: any) => v.userId === user?.id) && !seenLocally.has(e.id)
                          ).length || 0;
                          return missedCount > 0 ? (
                            <Badge variant="destructive" className="ml-2 text-[10px]" data-testid="badge-drawer-missed">{missedCount} new</Badge>
                          ) : null;
                        })()}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-[90vw] sm:max-w-md overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle className="font-serif">Project Details</SheetTitle>
                        <SheetDescription className="sr-only">Project sidebar with client, access, and activity information</SheetDescription>
                      </SheetHeader>
                      <div className="space-y-6 mt-4">
                        <BudgetSnapshot projectId={projectId} userRole={userRole} />
                        <ProjectSidebarCards
                          project={project}
                          user={user}
                          users={users}
                          userRole={userRole}
                          onlineUsers={onlineUsers}
                          planningBoards={planningBoards}
                          assignedClient={assignedClient}
                          activityLog={activityLog}
                          seenLocally={seenLocally}
                          toast={toast}
                          updateProject={updateProject}
                          notifyTeam={notifyTeam}
                          sendingNotification={sendingNotification}
                          showNotifyForm={showNotifyForm}
                          setShowNotifyForm={setShowNotifyForm}
                          notifyMessage={notifyMessage}
                          setNotifyMessage={setNotifyMessage}
                          selectedRecipients={selectedRecipients}
                          setSelectedRecipients={setSelectedRecipients}
                          setEditingUser={setEditingUser}
                          setProfileForm={setProfileForm}
                          setShowAddPerson={setShowAddPerson}
                          setAddPersonForm={setAddPersonForm}
                          setActiveTab={setActiveTab}
                          projectId={projectId}
                        />
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>

                <div className="space-y-6 hidden md:block">
                  <BudgetSnapshot projectId={projectId} userRole={userRole} />
                  <ProjectSidebarCards
                    project={project}
                    user={user}
                    users={users}
                    userRole={userRole}
                    onlineUsers={onlineUsers}
                    planningBoards={planningBoards}
                    assignedClient={assignedClient}
                    activityLog={activityLog}
                    seenLocally={seenLocally}
                    toast={toast}
                    updateProject={updateProject}
                    notifyTeam={notifyTeam}
                    sendingNotification={sendingNotification}
                    showNotifyForm={showNotifyForm}
                    setShowNotifyForm={setShowNotifyForm}
                    notifyMessage={notifyMessage}
                    setNotifyMessage={setNotifyMessage}
                    selectedRecipients={selectedRecipients}
                    setSelectedRecipients={setSelectedRecipients}
                    setEditingUser={setEditingUser}
                    setProfileForm={setProfileForm}
                    setShowAddPerson={setShowAddPerson}
                    setAddPersonForm={setAddPersonForm}
                    setActiveTab={setActiveTab}
                    projectId={projectId}
                  />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="checklist" className="space-y-8">
            <ProgressTab
              projectId={projectId}
              milestones={milestones}
              sections={sections}
              tasks={tasks}
              userRole={userRole}
              subTab={progressSubTab}
              onSubTabChange={setProgressSubTab}
            />
          </TabsContent>

          <TabsContent value="board" className="flex-1 min-h-0">
            <SpatialCanvas projectId={projectId} />
          </TabsContent>

          <TabsContent value="furniture">
            <div className="p-4">
              <FurniturePlannerPanel projectId={projectId} />
            </div>
          </TabsContent>

          <TabsContent value="chat">
            <ChatTab projectId={projectId} />
          </TabsContent>

          <TabsContent value="photos">
            <PhotosTab projectId={projectId} />
          </TabsContent>

          <TabsContent value="docs">
            <DocumentsTab projectId={projectId} />
          </TabsContent>
        </Tabs>
      </main>

      <OpenItemsDrawer projectId={projectId} open={showOpenItemsDrawer} onOpenChange={setShowOpenItemsDrawer} />

      <Dialog open={showAddPerson} onOpenChange={(open) => { if (!open) setShowAddPerson(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Add New Person</DialogTitle>
            <DialogDescription>Add a team member, crew, or client.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">First Name</label>
                <Input
                  value={addPersonForm.firstName}
                  onChange={(e) => setAddPersonForm({ ...addPersonForm, firstName: e.target.value })}
                  placeholder="First name"
                  data-testid="input-add-firstname"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Last Name</label>
                <Input
                  value={addPersonForm.lastName}
                  onChange={(e) => setAddPersonForm({ ...addPersonForm, lastName: e.target.value })}
                  placeholder="Last name"
                  data-testid="input-add-lastname"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input
                value={addPersonForm.email}
                onChange={(e) => setAddPersonForm({ ...addPersonForm, email: e.target.value })}
                placeholder="email@example.com"
                data-testid="input-add-email"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
              <Input
                value={addPersonForm.phone}
                onChange={(e) => setAddPersonForm({ ...addPersonForm, phone: e.target.value })}
                placeholder="(705) 555-0123"
                data-testid="input-add-phone"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
              <Select value={addPersonForm.role} onValueChange={(v) => setAddPersonForm({ ...addPersonForm, role: v })}>
                <SelectTrigger data-testid="select-add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="crew">Crew</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowAddPerson(false)} data-testid="button-cancel-add-person">Cancel</Button>
              <Button
                disabled={addingPerson || !addPersonForm.firstName || !addPersonForm.lastName || !addPersonForm.email}
                data-testid="button-save-add-person"
                onClick={async () => {
                  setAddingPerson(true);
                  try {
                    const res = await fetch("/api/users", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({
                        firstName: addPersonForm.firstName,
                        lastName: addPersonForm.lastName,
                        email: addPersonForm.email,
                        phone: addPersonForm.phone || null,
                        role: addPersonForm.role,
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      throw new Error(data.message || "Failed to add person");
                    }
                    toast({ title: "Person added", description: `${addPersonForm.firstName} ${addPersonForm.lastName} has been added` });
                    setShowAddPerson(false);
                    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
                  } catch (err: any) {
                    toast({ title: "Error", description: err.message, variant: "destructive" });
                  } finally {
                    setAddingPerson(false);
                  }
                }}
              >
                {addingPerson ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Person"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) { setEditingUser(null); setConfirmDeleteUser(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Edit Team Member</DialogTitle>
            <DialogDescription>Update this person's details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">First Name</label>
                <Input
                  value={profileForm.firstName}
                  onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                  data-testid="input-edit-firstname"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Last Name</label>
                <Input
                  value={profileForm.lastName}
                  onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                  data-testid="input-edit-lastname"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                data-testid="input-edit-email"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
              <Input
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                placeholder="(705) 555-0123"
                data-testid="input-edit-phone"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
              <Select value={profileForm.role} onValueChange={(v) => setProfileForm({ ...profileForm, role: v })}>
                <SelectTrigger data-testid="select-edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="crew">Crew</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {confirmDeleteUser ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                <p className="text-sm text-destructive font-medium">Are you sure you want to remove this person? Their messages and time entries will also be deleted. This cannot be undone.</p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteUser(false)} data-testid="button-cancel-delete-user">No, Keep</Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deletingUser}
                    data-testid="button-confirm-delete-user"
                    onClick={async () => {
                      if (!editingUser) return;
                      setDeletingUser(true);
                      try {
                        const res = await fetch(`/api/users/${editingUser.id}`, {
                          method: "DELETE",
                          credentials: "include",
                        });
                        if (!res.ok) {
                          const data = await res.json();
                          throw new Error(data.message || "Failed to delete");
                        }
                        toast({ title: "User removed" });
                        setEditingUser(null);
                        setConfirmDeleteUser(false);
                        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
                      } catch (err: any) {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                      } finally {
                        setDeletingUser(false);
                      }
                    }}
                  >
                    {deletingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Remove"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between gap-2 pt-2">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setConfirmDeleteUser(true)}
                    data-testid="button-delete-user"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="button-archive-user"
                    onClick={async () => {
                      if (!editingUser) return;
                      const isArchived = !!editingUser.archivedAt;
                      try {
                        const res = await fetch(`/api/users/${editingUser.id}/${isArchived ? "unarchive" : "archive"}`, {
                          method: "POST",
                          credentials: "include",
                        });
                        if (!res.ok) {
                          const data = await res.json();
                          throw new Error(data.message || "Failed");
                        }
                        toast({ title: isArchived ? "User restored" : "User archived" });
                        setEditingUser(null);
                        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
                      } catch (err: any) {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                      }
                    }}
                  >
                    {editingUser?.archivedAt ? (
                      <><ArchiveRestore className="h-4 w-4 mr-1" />Restore</>
                    ) : (
                      <><Archive className="h-4 w-4 mr-1" />Archive</>
                    )}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setEditingUser(null)} data-testid="button-cancel-edit-user">Cancel</Button>
                  <Button
                    data-testid="button-save-edit-user"
                    onClick={async () => {
                      if (!editingUser) return;
                      try {
                        const res = await fetch(`/api/users/${editingUser.id}/profile`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({
                            firstName: profileForm.firstName,
                            lastName: profileForm.lastName,
                            email: profileForm.email,
                            phone: profileForm.phone || null,
                            role: profileForm.role,
                          }),
                        });
                        if (!res.ok) throw new Error("Failed to update");
                        toast({ title: "Profile updated" });
                        setEditingUser(null);
                        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
                      } catch (err: any) {
                        toast({ title: "Error", description: err.message, variant: "destructive" });
                      }
                    }}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const EDITED_TEXT_COLOR = "#b45309";

function ChecklistTab({ projectId, compact = false }: { projectId: number; compact?: boolean }) {
  const { user } = useAuth();
  const { viewMode } = useViewMode();
  const actualRole = user?.role || "client";
  const effectiveRole = actualRole === "admin" ? viewMode : actualRole;
  const { toast } = useToast();
  const { data: items, isLoading } = useChecklistItems(projectId);
  const { mutate: createItem, isPending: isCreating } = useCreateChecklistItem();
  const { mutate: updateItem } = useUpdateChecklistItem();
  const { mutate: deleteItem } = useDeleteChecklistItem();
  const { mutate: addToCalendar } = useCreateCalendarEvent();
  const { data: checklistMilestones } = useMilestones(projectId);
  const { mutate: updateChecklistMilestone } = useUpdateMilestone();
  const { data: allChecklistUsers } = useUsers();

  const [newTitle, setNewTitle] = useState("");
  const [newGroup, setNewGroup] = useState("General");
  const [customGroup, setCustomGroup] = useState("");
  const [newPriority, setNewPriority] = useState("normal");
  const [newStatus, setNewStatus] = useState("todo");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null);
  const [editForm, setEditForm] = useState({ title: "", group: "", priority: "normal", status: "todo", notes: "", priceEstimate: "" });

  const { mutate: createMilestone, isPending: isCreatingMilestone } = useCreateMilestone();
  const { mutate: createTask, isPending: isCreatingTask } = useCreateTask();
  const { data: sectionsForMove } = useSections(projectId);

  const [moveItem, setMoveItem] = useState<ChecklistItem | null>(null);
  const [moveMode, setMoveMode] = useState<"building" | "task" | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");

  const isAdmin = effectiveRole === "admin";
  const _isCrew = effectiveRole === "crew" || effectiveRole === "admin";

  const roomsForBuilding = selectedBuildingId
    ? (sectionsForMove || []).filter((s: any) => s.milestoneId === parseInt(selectedBuildingId))
    : [];

  const handleMoveToTimeline = () => {
    if (!moveItem || !isAdmin) return;
    const appendNote = (existing: string | null | undefined) => {
      const tag = "📌 Moved to Timeline";
      if (existing && existing.includes(tag)) return existing;
      return existing ? `${existing}\n${tag}` : tag;
    };

    const closeDialog = () => {
      setMoveItem(null);
      setMoveMode(null);
      setSelectedBuildingId("");
      setSelectedRoomId("");
    };

    const markAsMovedAndClose = (description: string) => {
      updateItem(
        { id: moveItem.id, notes: appendNote(moveItem.notes) },
        {
          onSuccess: () => {
            toast({ title: "Moved to Timeline", description });
            closeDialog();
          },
          onError: () => {
            toast({ title: "Moved to Timeline", description: `${description} (Note annotation could not be saved.)` });
            closeDialog();
          },
        }
      );
    };

    if (moveMode === "building") {
      createMilestone(
        { projectId, title: moveItem.title },
        {
          onSuccess: () => markAsMovedAndClose(`"${moveItem.title}" created as a new milestone.`),
          onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
        }
      );
    } else if (moveMode === "task" && selectedBuildingId) {
      createTask(
        {
          projectId,
          milestoneId: parseInt(selectedBuildingId),
          sectionId: selectedRoomId && selectedRoomId !== "__none__" ? parseInt(selectedRoomId) : undefined,
          title: moveItem.title,
          description: moveItem.notes || undefined,
        },
        {
          onSuccess: () => markAsMovedAndClose(`"${moveItem.title}" added as a task.`),
          onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
        }
      );
    }
  };

  const defaultGroups = ["Boathouse", "Cottage", "General"];
  const existingGroups = items
    ? Array.from(new Set(items.map((i: ChecklistItem) => i.group || "General")))
    : [];
  const allGroups = Array.from(new Set([...defaultGroups, ...existingGroups]));

  const groupedItems: Record<string, ChecklistItem[]> = {};
  if (items) {
    for (const item of items as ChecklistItem[]) {
      const g = item.group || "General";
      if (!groupedItems[g]) groupedItems[g] = [];
      groupedItems[g].push(item);
    }
  }

  const totalItems = items?.length || 0;
  const completedItems = items?.filter((i: ChecklistItem) => i.status === "done" || i.completed).length || 0;
  const nextYearItems = items?.filter((i: ChecklistItem) => i.status === "next_year").length || 0;
  const totalEstimate = items?.reduce((sum: number, i: ChecklistItem) => sum + (i.priceEstimate || 0), 0) || 0;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const groupValue = newGroup === "__custom__" ? customGroup.trim() || "General" : newGroup;
    createItem(
      { projectId, title: newTitle.trim(), priority: newPriority, group: groupValue, status: newStatus },
      {
        onSuccess: () => {
          toast({ title: "Success", description: "Checklist item added." });
          setNewTitle("");
          setNewPriority("normal");
          setNewStatus("todo");
          setNewGroup("General");
          setCustomGroup("");
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleToggle = (item: ChecklistItem) => {
    const newStatusValue = item.status === "done" ? "todo" : "done";
    updateItem(
      { id: item.id, completed: newStatusValue === "done", status: newStatusValue },
      { onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }) }
    );
  };

  const _handleNotesChange = (item: ChecklistItem, notes: string) => {
    updateItem({ id: item.id, notes });
  };

  const _handlePriceChange = (item: ChecklistItem, value: string) => {
    const priceEstimate = value ? parseInt(value, 10) : null;
    updateItem({ id: item.id, priceEstimate });
  };

  const handleDelete = (id: number) => {
    deleteItem(id, {
      onSuccess: () => toast({ title: "Success", description: "Item removed." }),
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const openEditDialog = (item: ChecklistItem) => {
    setEditForm({
      title: item.title,
      group: item.group || "General",
      priority: item.priority || "normal",
      status: item.status || "todo",
      notes: item.notes || "",
      priceEstimate: item.priceEstimate != null ? String(item.priceEstimate) : "",
    });
    setEditItem(item);
  };

  const handleEditSave = () => {
    if (!editItem) return;
    updateItem(
      {
        id: editItem.id,
        title: editForm.title,
        group: editForm.group,
        priority: editForm.priority,
        status: editForm.status,
        completed: editForm.status === "done",
        notes: editForm.notes || null,
        priceEstimate: editForm.priceEstimate ? parseInt(editForm.priceEstimate, 10) : null,
        color: EDITED_TEXT_COLOR,
      },
      {
        onSuccess: () => {
          toast({ title: "Updated", description: "Checklist item updated." });
          setEditItem(null);
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const priorityVariant = (p: string | null) => {
    if (p === "high") return "destructive" as const;
    if (p === "low") return "outline" as const;
    return "secondary" as const;
  };

  const statusLabel: Record<string, string> = {
    todo: "To Do",
    in_progress: "In Progress",
    done: "Done",
    next_year: "Next Year",
  };

  const statusBadge = (status: string | null) => {
    const s = status || "todo";
    if (s === "done") return <Badge className="bg-green-600 dark:bg-green-500 text-white border-transparent no-default-hover-elevate" data-testid="badge-status-done">{statusLabel[s]}</Badge>;
    if (s === "in_progress") return <Badge className="bg-amber-500 dark:bg-amber-400 text-white border-transparent no-default-hover-elevate" data-testid="badge-status-in-progress">{statusLabel[s]}</Badge>;
    if (s === "next_year") return <Badge variant="outline" className="text-muted-foreground no-default-hover-elevate" data-testid="badge-status-next-year">{statusLabel[s]}</Badge>;
    return <Badge variant="secondary" className="no-default-hover-elevate" data-testid="badge-status-todo">{statusLabel[s]}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin text-muted-foreground" data-testid="loader-checklist" />
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground" data-testid="checklist-summary">
        <span data-testid="text-total-items">{totalItems} items total</span>
        <span className="text-border">·</span>
        <span data-testid="text-completed-items">{completedItems} completed</span>
        <span className="text-border">·</span>
        <span data-testid="text-next-year-items">{nextYearItems} next year</span>
        {totalEstimate > 0 && (
          <>
            <span className="text-border">·</span>
            <span className="font-medium text-foreground" data-testid="text-total-estimate">
              ${totalEstimate.toLocaleString()} estimated
            </span>
          </>
        )}
      </div>

      {checklistMilestones && checklistMilestones.length > 0 && (
        <div data-testid="checklist-milestones-section" className="rounded-lg border border-border/60 bg-transparent">
          <div className="px-1 pt-1">
            <p className="text-xs text-muted-foreground mb-2 px-3" data-testid="text-milestones-heading">
              Items you'd like to explore adding to the project scope.
            </p>
            <div className="border-t border-border/60">
              {checklistMilestones.map((ms: any) => {
                const isDone = !!ms.completed;
                const completedUser = ms.completedBy
                  ? (allChecklistUsers as any[])?.find((u: any) => u.id === ms.completedBy)
                  : null;
                return (
                  <div
                    key={ms.id}
                    className={`flex items-start gap-3 px-3 py-2.5 border-b border-border/60 last:border-b-0 transition-opacity ${isDone ? "opacity-60" : ""}`}
                    data-testid={`checklist-milestone-${ms.id}`}
                  >
                    <Checkbox
                      checked={isDone}
                      onCheckedChange={() => {
                        updateChecklistMilestone(
                          { id: ms.id, projectId, completed: !isDone, completedBy: isDone ? null : undefined },
                          {
                            onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                          }
                        );
                      }}
                      className="mt-0.5"
                      data-testid={`checkbox-milestone-${ms.id}`}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Flag className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                        <span
                          className={`font-medium text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}
                          data-testid={`text-checklist-milestone-title-${ms.id}`}
                        >
                          {ms.title}
                        </span>
                        {ms.date && (
                          <Badge variant="outline" className="text-[10px] no-default-hover-elevate" data-testid={`badge-milestone-date-${ms.id}`}>
                            {format(new Date(ms.date), "MMM d, yyyy")}
                          </Badge>
                        )}
                      </div>
                      {completedUser && (
                        <span className="text-xs text-muted-foreground" data-testid={`text-checklist-milestone-completedby-${ms.id}`}>
                          Completed by: {completedUser.firstName} {completedUser.lastName}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleAdd} className="space-y-2 sm:space-y-0 sm:flex sm:flex-row sm:gap-2.5 sm:flex-wrap" data-testid="form-add-checklist">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a checklist item..."
          className="flex-1 min-w-[200px] rounded-md"
          data-testid="input-checklist-title"
        />
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-row sm:gap-2.5">
          <Select value={newGroup} onValueChange={(v) => { setNewGroup(v); if (v !== "__custom__") setCustomGroup(""); }}>
            <SelectTrigger className="w-full sm:w-[160px] rounded-md" data-testid="select-checklist-group">
              <SelectValue placeholder="Group" />
            </SelectTrigger>
            <SelectContent>
              {allGroups.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
              <SelectItem value="__custom__">Custom...</SelectItem>
            </SelectContent>
          </Select>
          <Select value={newPriority} onValueChange={setNewPriority}>
            <SelectTrigger className="w-full sm:w-[120px] rounded-md" data-testid="select-checklist-priority">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger className="w-full sm:w-[140px] rounded-md" data-testid="select-checklist-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">To Do</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="next_year">Next Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {newGroup === "__custom__" && (
          <Input
            value={customGroup}
            onChange={(e) => setCustomGroup(e.target.value)}
            placeholder="Custom group name..."
            className="w-full sm:w-[160px]"
            data-testid="input-custom-group"
          />
        )}
        <Button type="submit" variant="secondary" className="w-full sm:w-auto rounded-md shadow-none" disabled={isCreating || !newTitle.trim()} data-testid="button-add-checklist">
          {isCreating ? <Loader2 className="mr-2 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add
        </Button>
      </form>

      {totalItems > 0 ? (
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([group, groupItems]) => (
            <Card key={group} data-testid={`checklist-group-${group}`}>
              <div
                className="flex items-center gap-2 p-4 cursor-pointer select-none"
                onClick={() => toggleGroup(group)}
                data-testid={`button-toggle-group-${group}`}
              >
                {collapsedGroups[group] ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="font-serif font-semibold text-foreground" data-testid={`text-group-name-${group}`}>
                  {group}
                </span>
                <span className="text-xs text-muted-foreground" data-testid={`text-group-count-${group}`}>
                  ({groupItems.length})
                </span>
              </div>
              {!collapsedGroups[group] && (
                <div className="border-t" data-testid={`group-items-${group}`}>
                  {groupItems.map((item) => {
                    const isDone = item.status === "done" || !!item.completed;
                    const isNextYear = item.status === "next_year";
                    const itemColor = item.color || "";
                    return (
                      <div
                        key={item.id}
                        className={`relative flex items-start gap-3 px-4 py-3 border-b last:border-b-0 transition-opacity ${isDone ? "opacity-60" : ""} ${isNextYear ? "opacity-50" : ""}`}
                        data-testid={`checklist-item-${item.id}`}
                      >
                        <Checkbox
                          checked={isDone}
                          onCheckedChange={() => handleToggle(item)}
                          className="mt-0.5"
                          data-testid={`checkbox-checklist-${item.id}`}
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`font-medium text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}
                              style={!isDone && itemColor ? { color: itemColor } : undefined}
                              data-testid={`text-checklist-title-${item.id}`}
                            >
                              {item.title}
                            </span>
                            <Badge variant={priorityVariant(item.priority)} className="no-default-hover-elevate" data-testid={`badge-priority-${item.id}`}>
                              {item.priority || "normal"}
                            </Badge>
                            {statusBadge(item.status)}
                            {item.notes?.includes("📌 Moved to Timeline") && (
                              <Badge variant="outline" className="text-[10px] no-default-hover-elevate bg-primary/5 text-primary border-primary/20" data-testid={`badge-moved-timeline-${item.id}`}>
                                <ArrowUpRight className="h-3 w-3 mr-0.5" />
                                On Timeline
                              </Badge>
                            )}
                            {item.priceEstimate != null && (
                              <span className="text-xs text-muted-foreground" data-testid={`text-price-${item.id}`}>
                                ${item.priceEstimate.toLocaleString()}
                              </span>
                            )}
                          </div>
                          {item.notes && item.notes.replace("📌 Moved to Timeline", "").trim() && (
                            <p className="text-xs text-muted-foreground" data-testid={`text-notes-${item.id}`}>
                              {item.notes.replace("📌 Moved to Timeline", "").trim()}
                            </p>
                          )}
                        </div>
                        <div className="hidden sm:flex items-center gap-1 relative z-[1]">
                          {isAdmin && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => { setMoveItem(item); setMoveMode(null); setSelectedBuildingId(""); setSelectedRoomId(""); }}
                                  data-testid={`button-move-timeline-${item.id}`}
                                >
                                  <ArrowUpRight className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Move to Timeline</TooltipContent>
                            </Tooltip>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              addToCalendar(
                                {
                                  projectId,
                                  title: item.title,
                                  description: item.notes || null,
                                  date: format(new Date(), "yyyy-MM-dd"),
                                  type: "event",
                                },
                                {
                                  onSuccess: () => toast({ title: "Added to Calendar", description: `"${item.title}" added to today's calendar.` }),
                                  onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                                }
                              );
                            }}
                            data-testid={`button-calendar-checklist-${item.id}`}
                          >
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditDialog(item)}
                            data-testid={`button-edit-checklist-${item.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(item.id)}
                            data-testid={`button-delete-checklist-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="sm:hidden relative z-[1]">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" data-testid={`button-checklist-menu-${item.id}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {isAdmin && (
                                <DropdownMenuItem
                                  onClick={() => { setMoveItem(item); setMoveMode(null); setSelectedBuildingId(""); setSelectedRoomId(""); }}
                                  data-testid={`menu-move-timeline-${item.id}`}
                                >
                                  <ArrowUpRight className="mr-2 h-4 w-4" />
                                  Move to Timeline
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => {
                                  addToCalendar(
                                    {
                                      projectId,
                                      title: item.title,
                                      description: item.notes || null,
                                      date: format(new Date(), "yyyy-MM-dd"),
                                      type: "event",
                                    },
                                    {
                                      onSuccess: () => toast({ title: "Added to Calendar", description: `"${item.title}" added to today's calendar.` }),
                                      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
                                    }
                                  );
                                }}
                                data-testid={`menu-calendar-${item.id}`}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                Add to Calendar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => openEditDialog(item)}
                                data-testid={`menu-edit-${item.id}`}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(item.id)}
                                className="text-destructive"
                                data-testid={`menu-delete-${item.id}`}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground text-sm" data-testid="text-empty-checklist">
          No checklist items yet. Add your first item above.
        </div>
      )}

      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) setEditItem(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl" data-testid="text-edit-dialog-title">Edit Item</DialogTitle>
            <DialogDescription>Update the checklist item details and color.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Title</label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                data-testid="input-edit-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Group</label>
                <Select value={editForm.group} onValueChange={(v) => setEditForm({ ...editForm, group: v })}>
                  <SelectTrigger data-testid="select-edit-group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allGroups.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Priority</label>
                <Select value={editForm.priority} onValueChange={(v) => setEditForm({ ...editForm, priority: v })}>
                  <SelectTrigger data-testid="select-edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger data-testid="select-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="next_year">Next Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Add notes..."
                className="resize-none"
                rows={2}
                data-testid="textarea-edit-notes"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Price Estimate ($)</label>
              <Input
                type="number"
                value={editForm.priceEstimate}
                onChange={(e) => setEditForm({ ...editForm, priceEstimate: e.target.value })}
                placeholder="0"
                data-testid="input-edit-price"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditItem(null)} data-testid="button-edit-cancel">Cancel</Button>
              <Button onClick={handleEditSave} disabled={!editForm.title.trim()} data-testid="button-edit-save">Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moveItem} onOpenChange={(open) => { if (!open) { setMoveItem(null); setMoveMode(null); setSelectedBuildingId(""); setSelectedRoomId(""); } }}>
        <DialogContent className="sm:max-w-[420px]" data-testid="dialog-move-timeline">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl" data-testid="text-move-dialog-title">Move to Timeline</DialogTitle>
            <DialogDescription>
              Add <span className="font-medium">"{moveItem?.title}"</span> to the project timeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {!moveMode ? (
              <div className="grid grid-cols-1 gap-3">
                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-start gap-1 text-left"
                  onClick={() => setMoveMode("building")}
                  data-testid="button-move-as-building"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Building2 className="h-4 w-4" />
                    Create as New Milestone
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Add a new milestone to the timeline with this title
                  </span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-start gap-1 text-left"
                  onClick={() => setMoveMode("task")}
                  data-testid="button-move-as-task"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <CheckSquare className="h-4 w-4" />
                    Add as Task
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Add as a task inside an existing milestone or room
                  </span>
                </Button>
              </div>
            ) : moveMode === "building" ? (
              <div className="space-y-4">
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-sm">
                    A new milestone called <span className="font-medium">"{moveItem?.title}"</span> will be created on the timeline.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setMoveMode(null)} data-testid="button-move-back">Back</Button>
                  <Button
                    onClick={handleMoveToTimeline}
                    disabled={isCreatingMilestone}
                    data-testid="button-move-confirm-building"
                  >
                    {isCreatingMilestone && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Milestone
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Milestone</label>
                  <Select value={selectedBuildingId} onValueChange={(v) => { setSelectedBuildingId(v); setSelectedRoomId(""); }}>
                    <SelectTrigger data-testid="select-move-building">
                      <SelectValue placeholder="Select a milestone..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(checklistMilestones || []).map((m: any) => (
                        <SelectItem key={m.id} value={String(m.id)}>{m.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedBuildingId && roomsForBuilding.length > 0 && (
                  <div>
                    <label className="text-sm font-medium mb-1 block">Room (optional)</label>
                    <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                      <SelectTrigger data-testid="select-move-room">
                        <SelectValue placeholder="No room (general tasks)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No room (general tasks)</SelectItem>
                        {roomsForBuilding.map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setMoveMode(null); setSelectedBuildingId(""); setSelectedRoomId(""); }} data-testid="button-move-back-task">Back</Button>
                  <Button
                    onClick={handleMoveToTimeline}
                    disabled={!selectedBuildingId || isCreatingTask}
                    data-testid="button-move-confirm-task"
                  >
                    {isCreatingTask && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Task
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function OpenItemsDrawer({ projectId, open, onOpenChange }: { projectId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[94vw] sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif text-lg">Open Items</SheetTitle>
          <SheetDescription className="sr-only">Open items drawer for new discussion items and wish-list changes</SheetDescription>
        </SheetHeader>
        <div className="mt-2">
          <ChecklistTab projectId={projectId} compact />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function _BoardTab({ projectId }: { projectId: number }) {
  const { toast } = useToast();
  const { data: items, isLoading } = useBoardItems(projectId);
  const { mutate: createItem, isPending: isCreating } = useCreateBoardItem();
  const { mutate: deleteItem } = useDeleteBoardItem();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [boardForm, setBoardForm] = useState({ type: "note", title: "", content: "", imageUrl: "", linkUrl: "", color: "#ffffff" });
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});

  const noteColors = [
    { value: "#fef9ef", label: "Warm Cream", dark: "#e8d9b0" },
    { value: "#e8ede5", label: "Sage Green", dark: "#b5c4ae" },
    { value: "#e8f0f8", label: "Soft Blue", dark: "#a8c4de" },
    { value: "#f0eaf8", label: "Lavender", dark: "#c4b0de" },
    { value: "#fceef0", label: "Blush Pink", dark: "#e8b0b8" },
    { value: "#ffffff", label: "White", dark: "#d4d4d4" },
  ];

  const getDarkerShade = (hex: string) => {
    const found = noteColors.find((c) => c.value === hex);
    return found ? found.dark : "#cccccc";
  };

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createItem(
      {
        projectId,
        type: boardForm.type,
        title: boardForm.title || null,
        content: boardForm.content || null,
        imageUrl: boardForm.type === "image" ? boardForm.imageUrl || null : null,
        linkUrl: boardForm.type === "link" ? boardForm.linkUrl || null : null,
        color: boardForm.type === "note" ? boardForm.color : null,
      },
      {
        onSuccess: () => {
          toast({ title: "Success", description: "Item added to board." });
          setDialogOpen(false);
          setBoardForm({ type: "note", title: "", content: "", imageUrl: "", linkUrl: "", color: "#ffffff" });
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteItem(id, {
      onSuccess: () => toast({ title: "Success", description: "Item removed from board." }),
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="animate-spin text-muted-foreground" data-testid="loader-board" />
      </div>
    );
  }

  const renderNoteCard = (item: BoardItem) => {
    const bgColor = item.color || "#ffffff";
    const stripColor = getDarkerShade(bgColor);
    return (
      <div
        className="relative rounded-md overflow-visible hover-elevate transition-shadow bg-card dark:bg-card"
        data-testid={`board-item-${item.id}`}
      >
        <div
          className="absolute inset-0 rounded-md opacity-30 dark:opacity-15 pointer-events-none"
          style={{ backgroundColor: bgColor }}
        />
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md" style={{ backgroundColor: stripColor }} />
        <div className="absolute top-2 right-2 z-10" style={{ visibility: "visible" }}>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleDelete(item.id)}
            data-testid={`button-delete-board-${item.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative p-4 pl-5">
          {item.title && (
            <h4 className="font-serif font-bold text-sm text-foreground" data-testid={`text-board-title-${item.id}`}>
              {item.title}
            </h4>
          )}
          {item.content && (
            <p className="text-xs mt-1.5 text-muted-foreground" data-testid={`text-board-content-${item.id}`}>
              {item.content}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderImageCard = (item: BoardItem) => {
    const isBroken = brokenImages[item.id];
    return (
      <div
        className="relative rounded-md overflow-visible hover-elevate transition-shadow"
        data-testid={`board-item-${item.id}`}
      >
        <div className="absolute top-2 right-2 z-10" style={{ visibility: "visible" }}>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleDelete(item.id)}
            data-testid={`button-delete-board-${item.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {item.imageUrl && !isBroken ? (
          <div className="relative">
            <img
              src={item.imageUrl}
              alt={item.title || "Board image"}
              className="w-full object-cover rounded-md"
              style={{ maxHeight: "300px" }}
              onError={() => setBrokenImages((prev) => ({ ...prev, [item.id]: true }))}
              data-testid={`img-board-${item.id}`}
            />
            {item.title && (
              <div className="absolute bottom-0 left-0 right-0 p-3 rounded-b-md" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}>
                <h4 className="font-serif font-bold text-sm text-white" data-testid={`text-board-title-${item.id}`}>
                  {item.title}
                </h4>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 rounded-md bg-muted">
            <ImageIcon className="h-10 w-10 text-muted-foreground opacity-40" />
            {item.title && (
              <p className="text-xs text-muted-foreground mt-2" data-testid={`text-board-title-${item.id}`}>{item.title}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderLinkCard = (item: BoardItem) => {
    return (
      <a
        href={item.linkUrl || "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block rounded-md bg-card border border-border overflow-visible hover-elevate transition-shadow"
        data-testid={`board-item-${item.id}`}
      >
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-md" style={{ backgroundColor: "hsl(var(--accent))" }} />
        <div className="absolute top-2 right-2 z-10" style={{ visibility: "visible" }}>
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(item.id); }}
            data-testid={`button-delete-board-${item.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 pl-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Link2 className="h-3.5 w-3.5" />
            <span data-testid={`text-board-domain-${item.id}`}>{item.linkUrl ? getDomain(item.linkUrl) : "Link"}</span>
          </div>
          {item.title && (
            <h4 className="font-serif font-bold text-sm text-foreground" data-testid={`text-board-title-${item.id}`}>
              {item.title}
            </h4>
          )}
          {item.content && (
            <p className="text-xs text-muted-foreground mt-1.5" data-testid={`text-board-content-${item.id}`}>
              {item.content}
            </p>
          )}
        </div>
      </a>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-board">
              <Plus className="mr-2 h-4 w-4" />
              Add to Board
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl" data-testid="text-board-dialog-title">Add to Board</DialogTitle>
              <DialogDescription>Pin a note, image, or link to your inspiration board.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4 pt-2" data-testid="form-add-board">
              <div>
                <label className="text-sm font-medium mb-2 block">Type</label>
                <div className="flex gap-2" data-testid="board-type-selector">
                  {[
                    { value: "note", label: "Note", icon: <StickyNote className="h-4 w-4" /> },
                    { value: "image", label: "Image", icon: <ImageIcon className="h-4 w-4" /> },
                    { value: "link", label: "Link", icon: <Link2 className="h-4 w-4" /> },
                  ].map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={boardForm.type === opt.value ? "default" : "outline"}
                      onClick={() => setBoardForm({ ...boardForm, type: opt.value })}
                      data-testid={`button-board-type-${opt.value}`}
                    >
                      {opt.icon}
                      <span className="ml-1.5">{opt.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Title</label>
                <Input
                  value={boardForm.title}
                  onChange={(e) => setBoardForm({ ...boardForm, title: e.target.value })}
                  placeholder="Item title"
                  data-testid="input-board-title"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Content / Description</label>
                <Textarea
                  value={boardForm.content}
                  onChange={(e) => setBoardForm({ ...boardForm, content: e.target.value })}
                  placeholder="Description or content..."
                  className="resize-none"
                  rows={3}
                  data-testid="input-board-content"
                />
              </div>
              {boardForm.type === "image" && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Image URL</label>
                  <Input
                    value={boardForm.imageUrl}
                    onChange={(e) => setBoardForm({ ...boardForm, imageUrl: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                    data-testid="input-board-image"
                  />
                </div>
              )}
              {boardForm.type === "link" && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Link URL</label>
                  <Input
                    value={boardForm.linkUrl}
                    onChange={(e) => setBoardForm({ ...boardForm, linkUrl: e.target.value })}
                    placeholder="https://example.com"
                    data-testid="input-board-link"
                  />
                </div>
              )}
              {boardForm.type === "note" && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Color</label>
                  <div className="flex gap-2 flex-wrap" data-testid="board-color-picker">
                    {noteColors.map((c) => (
                      <div
                        key={c.value}
                        className="h-8 w-8 rounded-full cursor-pointer transition-transform flex-shrink-0"
                        style={{
                          backgroundColor: c.value,
                          border: boardForm.color === c.value ? `2px solid ${c.dark}` : "2px solid transparent",
                          boxShadow: boardForm.color === c.value ? `0 0 0 2px ${c.dark}` : "none",
                        }}
                        title={c.label}
                        onClick={() => setBoardForm({ ...boardForm, color: c.value })}
                        data-testid={`color-swatch-${c.label.toLowerCase().replace(/\s/g, "-")}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-board">
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating} data-testid="button-submit-board">
                  {isCreating ? <Loader2 className="mr-2 animate-spin" /> : null}
                  Add Item
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items && items.length > 0 ? (
        <div
          style={{ columnGap: "1rem" }}
          className="[column-count:1] sm:[column-count:2] lg:[column-count:3]"
          data-testid="board-masonry"
        >
          {items.map((item: BoardItem) => (
            <div key={item.id} className="mb-4" style={{ breakInside: "avoid" }}>
              {item.type === "image" ? renderImageCard(item) :
               item.type === "link" ? renderLinkCard(item) :
               renderNoteCard(item)}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground text-sm" data-testid="text-empty-board">
          Pin images, notes, and inspiration to your board.
        </div>
      )}
    </div>
  );
}

function PhotosTab({ projectId }: { projectId: number }) {
  const { data: photos, isLoading } = usePhotos(projectId);
  const { data: boards } = usePlanningBoards(projectId);
  const { mutate: createPhoto } = useCreatePhoto();
  const { mutate: deletePhoto } = useDeletePhoto();
  const { mutateAsync: uploadImage, isPending: isUploading } = useUploadImage();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; caption?: string | null } | null>(null);
  const [caption, setCaption] = useState("");

  const handleTagPhoto = async (photoId: number, boardId: number | null) => {
    try {
      const res = await fetch(`/api/photos/${photoId}/tag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planningBoardId: boardId }),
      });
      if (!res.ok) throw new Error("Failed");
      queryClient.invalidateQueries({ queryKey: ["/api/projects/:projectId/photos", projectId] });
      toast({ title: boardId ? "Photo tagged to board" : "Board tag removed" });
    } catch {
      toast({ title: "Failed to tag photo", variant: "destructive" });
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      try {
        const { url } = await uploadImage(file);
        createPhoto(
          { projectId, url, caption: caption || file.name },
          {
            onSuccess: () => {
              toast({ title: "Uploaded", description: `${file.name} added to gallery.` });
            },
            onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
          }
        );
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      }
    }

    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (id: number) => {
    deletePhoto(
      { id, projectId },
      {
        onSuccess: () => toast({ title: "Deleted", description: "Photo removed." }),
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="loader-photos" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-serif text-lg font-semibold" data-testid="text-photos-heading">Progress Photos</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Link href="/social-media">
              <Button variant="outline" size="sm" data-testid="button-create-social-post">
                <Sparkles className="mr-2 h-4 w-4" />
                Create Social Post
              </Button>
            </Link>
          )}
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            className="w-48"
            data-testid="input-photo-caption"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            data-testid="button-upload-photo"
          >
            {isUploading ? <Loader2 className="mr-2 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload Photos
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleFileSelect}
            multiple
            data-testid="input-photo-file"
          />
        </div>
      </div>

      {!photos || photos.length === 0 ? (
        <div className="text-center py-16">
          <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-sm" data-testid="text-photos-empty">
            No photos yet. Upload progress photos to share with your team.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="photo-grid">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group relative aspect-square rounded-md overflow-visible"
              data-testid={`photo-item-${photo.id}`}
            >
              <img
                src={photo.url}
                alt={photo.caption || "Project photo"}
                className="h-full w-full object-cover rounded-md cursor-pointer transition-transform"
                onClick={() => setLightboxPhoto({ url: photo.url, caption: photo.caption })}
                data-testid={`img-photo-${photo.id}`}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-md pointer-events-none" />
              <div className="absolute top-2 right-2 flex gap-1 invisible group-hover:visible">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="secondary" data-testid={`button-photo-menu-${photo.id}`}>
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setLightboxPhoto({ url: photo.url, caption: photo.caption })} data-testid={`button-zoom-photo-${photo.id}`}>
                      <ZoomIn className="h-4 w-4 mr-2" /> View Full Size
                    </DropdownMenuItem>
                    {boards && boards.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs">Tag to Board</DropdownMenuLabel>
                        {boards.map((board: any) => (
                          <DropdownMenuItem key={board.id} onClick={() => handleTagPhoto(photo.id, board.id)} data-testid={`button-tag-photo-${photo.id}-board-${board.id}`}>
                            <LayoutGrid className="h-4 w-4 mr-2" /> {board.name}
                            {photo.planningBoardId === board.id && <Check className="h-3 w-3 ml-auto" />}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                    {photo.planningBoardId && (
                      <DropdownMenuItem onClick={() => handleTagPhoto(photo.id, null)} data-testid={`button-untag-photo-${photo.id}`}>
                        <X className="h-4 w-4 mr-2" /> Remove Board Tag
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(photo.id)} data-testid={`button-delete-photo-${photo.id}`}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete Photo
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {photo.planningBoardId && boards && (() => {
                const board = boards.find((b: any) => b.id === photo.planningBoardId);
                return board ? (
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <LayoutGrid className="h-2.5 w-2.5" />
                      {board.name}
                    </Badge>
                  </div>
                ) : null;
              })()}
              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent rounded-b-md">
                  <p className="text-white text-xs truncate" data-testid={`text-photo-caption-${photo.id}`}>
                    {photo.caption}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxPhoto(null)}
          data-testid="photo-lightbox"
        >
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-4 right-4 text-white"
            onClick={() => setLightboxPhoto(null)}
            data-testid="button-close-lightbox"
          >
            <X className="h-6 w-6" />
          </Button>
          <div className="max-w-4xl max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.caption || "Photo"}
              className="max-h-[80vh] max-w-full object-contain rounded-md"
              data-testid="img-lightbox"
            />
            {lightboxPhoto.caption && (
              <p className="text-white text-sm mt-3 text-center" data-testid="text-lightbox-caption">
                {lightboxPhoto.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatTab({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const { data: messages, isLoading } = useMessages(projectId);
  const { mutate: sendMessage, isPending } = useSendMessage();
  const { mutateAsync: uploadImage, isPending: isUploadingImage } = useUploadImage();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    try {
      const { url } = await uploadImage(file);
      setAttachedImage(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setImagePreview(null);
      setAttachedImage(null);
    }
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeAttachment = () => {
    setAttachedImage(null);
    setImagePreview(null);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!content.trim() && !attachedImage) || !user) return;

    sendMessage(
      {
        projectId,
        content: content.trim() || (attachedImage ? "Shared a photo" : ""),
        senderId: user.id || "unknown",
        imageUrl: attachedImage,
      },
      {
        onSuccess: () => {
          setContent("");
          setAttachedImage(null);
          setImagePreview(null);
        },
      }
    );
  };

  return (
    <Card className="h-[600px] flex flex-col" data-testid="chat-container">
      <CardHeader className="border-b">
        <CardTitle className="font-serif text-lg" data-testid="text-chat-heading">
          Project Communication
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4" ref={scrollRef}>
            {isLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="animate-spin text-muted-foreground" />
              </div>
            ) : messages?.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm" data-testid="text-no-messages">
                This is your direct line to our team. We typically respond within 24–48 hours.
              </p>
            ) : (
              messages?.map((msg: any) => {
                const isMe = msg.senderId === user?.id;
                const sender = msg.sender;
                const senderFirst = sender?.firstName || sender?.email?.split("@")[0] || "User";
                const senderInitials = sender?.firstName
                  ? (sender.firstName[0] + (sender.lastName?.[0] || "")).toUpperCase()
                  : "?";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                    data-testid={`message-${msg.id}`}
                  >
                    {!isMe && (
                      <Avatar className="h-7 w-7 mr-2 mt-1 flex-shrink-0">
                        <AvatarFallback className="text-[10px]" data-testid={`avatar-sender-${msg.id}`}>{senderInitials}</AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                        isMe
                          ? "bg-foreground text-background"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <span
                        className="text-[10px] font-semibold block mb-0.5 opacity-70"
                        data-testid={`text-sender-name-${msg.id}`}
                      >
                        {isMe ? "You" : senderFirst}
                      </span>
                      {msg.imageUrl && (
                        <img
                          src={msg.imageUrl}
                          alt="Attached"
                          className="rounded-md max-w-full max-h-48 object-cover mb-1.5 cursor-pointer"
                          onClick={() => window.open(msg.imageUrl, "_blank")}
                          data-testid={`img-message-${msg.id}`}
                        />
                      )}
                      {msg.content && msg.content !== "Shared a photo" && (
                        <p>{msg.content}</p>
                      )}
                      {msg.content === "Shared a photo" && !msg.imageUrl && (
                        <p>{msg.content}</p>
                      )}
                      <span className="text-[10px] opacity-60 block mt-1 text-right">
                        {msg.createdAt && format(new Date(msg.createdAt), "h:mm a")}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="border-t bg-background">
          {imagePreview && (
            <div className="px-4 pt-3 flex items-center gap-2" data-testid="chat-image-preview">
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Attachment preview"
                  className="h-16 w-16 object-cover rounded-md border"
                  data-testid="img-chat-preview"
                />
                {isUploadingImage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </div>
                )}
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full"
                  onClick={removeAttachment}
                  data-testid="button-remove-attachment"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          <div className="p-4">
            <form onSubmit={handleSend} className="flex gap-2" data-testid="form-chat">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => imageInputRef.current?.click()}
                disabled={isUploadingImage}
                data-testid="button-attach-image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleImageSelect}
                data-testid="input-chat-image"
              />
              <Input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
                data-testid="input-chat-message"
              />
              <Button
                type="submit"
                disabled={isPending || isUploadingImage || (!content.trim() && !attachedImage)}
                data-testid="button-send-message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const docTypeLabels: Record<string, string> = {
  contract: "Contract",
  invoice: "Invoice",
  plan: "Plan",
  change_order: "Change Order",
  permit: "Permit",
  other: "Other",
};

function DocumentsTab({ projectId }: { projectId: number }) {
  const { data: documents, isLoading } = useDocuments(projectId);
  const { mutate: uploadDoc, isPending: isUploading } = useUploadDocument();
  const { mutate: deleteDoc } = useDeleteDocument();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("other");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      uploadDoc(
        { projectId, file, title: file.name, type: docType },
        {
          onSuccess: () => {
            toast({ title: "Uploaded", description: `${file.name} uploaded successfully.` });
          },
          onError: (err) => {
            toast({ title: "Error", description: err.message, variant: "destructive" });
          },
        }
      );
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = (url: string, title: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = title;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-serif text-lg font-semibold" data-testid="text-docs-heading">Documents</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger className="w-36" data-testid="select-doc-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="plan">Plan</SelectItem>
              <SelectItem value="change_order">Change Order</SelectItem>
              <SelectItem value="permit">Permit</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            data-testid="button-upload-doc"
          >
            {isUploading ? <Loader2 className="mr-2 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.gif,.webp"
            className="hidden"
            onChange={handleFileSelect}
            multiple
            data-testid="input-doc-file"
          />
        </div>
      </div>

      {!documents || documents.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm" data-testid="text-docs-empty">
          No documents yet. Upload files to share with your team.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <Card key={doc.id} className="flex items-center justify-between gap-3 p-4" data-testid={`doc-item-${doc.id}`}>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate" data-testid={`text-doc-title-${doc.id}`}>{doc.title}</p>
                  <Badge variant="secondary" className="text-xs mt-1" data-testid={`badge-doc-type-${doc.id}`}>
                    {docTypeLabels[doc.type] || doc.type}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {doc.url && doc.url !== "#" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDownload(doc.url, doc.title)}
                    data-testid={`button-download-${doc.id}`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    deleteDoc(doc.id, {
                      onSuccess: () => toast({ title: "Deleted", description: "Document removed." }),
                      onError: () => toast({ title: "Error", description: "Failed to delete document.", variant: "destructive" }),
                    });
                  }}
                  data-testid={`button-delete-doc-${doc.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
