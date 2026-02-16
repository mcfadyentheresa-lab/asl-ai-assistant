import { useParams, Link } from "wouter";
import { useProject, useMilestones, useTasks, useMessages, useSendMessage } from "@/hooks/use-projects";
import { Navbar } from "@/components/layout/Navbar";
import { Loader2, Calendar, CheckCircle, Clock, FileText, ImageIcon, MessageSquare, ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { motion } from "framer-motion";

export default function ProjectDetails() {
  const { id } = useParams();
  const projectId = Number(id);
  const { data: project, isLoading: loadingProject } = useProject(projectId);
  const { data: milestones } = useMilestones(projectId);
  const { data: tasks } = useTasks(projectId);

  if (loadingProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <h1 className="text-2xl font-bold">Project not found</h1>
        <Link href="/"><Button>Go Home</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      {/* Project Hero Header */}
      <div className="relative h-64 md:h-80 w-full overflow-hidden">
        {project.thumbnailUrl ? (
          <img 
            src={project.thumbnailUrl} 
            alt={project.name} 
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-primary/10" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        
        <div className="absolute bottom-0 left-0 right-0 container px-4 pb-8">
          <Link href="/" className="inline-flex items-center text-sm text-primary/80 hover:text-primary mb-4 transition-colors">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Dashboard
          </Link>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-primary mb-2">{project.name}</h1>
              <p className="text-lg text-muted-foreground max-w-2xl">{project.description}</p>
            </div>
            <Badge className="h-8 px-4 text-sm bg-primary text-primary-foreground border-none">
              {project.status.toUpperCase().replace("_", " ")}
            </Badge>
          </div>
        </div>
      </div>

      <main className="container px-4 mt-8">
        <Tabs defaultValue="overview" className="space-y-8">
          <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-transparent border-b border-border rounded-none gap-2">
            {[
              { value: "overview", icon: Clock, label: "Overview" },
              { value: "photos", icon: ImageIcon, label: "Photos" },
              { value: "docs", icon: FileText, label: "Documents" },
              { value: "chat", icon: MessageSquare, label: "Messages" },
            ].map(tab => (
              <TabsTrigger 
                key={tab.value} 
                value={tab.value}
                className="data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none px-6 py-3 font-medium text-muted-foreground transition-all"
              >
                <tab.icon className="mr-2 h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="space-y-8 animate-in fade-in-50 duration-500">
            <div className="grid md:grid-cols-3 gap-8">
              {/* Milestones Column */}
              <div className="md:col-span-2 space-y-6">
                <h3 className="text-xl font-display font-bold text-primary">Project Timeline</h3>
                
                <div className="relative border-l-2 border-border ml-3 space-y-8 pb-4">
                  {milestones && milestones.length > 0 ? milestones.map((milestone, idx) => (
                    <div key={milestone.id} className="relative pl-8">
                      <div className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-background ${milestone.completed ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                      
                      <Card className={`border-none shadow-sm ${milestone.completed ? 'bg-primary/5' : 'bg-card'}`}>
                        <CardHeader className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-lg font-semibold">{milestone.title}</CardTitle>
                              <CardDescription>
                                {milestone.date && format(new Date(milestone.date), "MMMM d, yyyy")}
                              </CardDescription>
                            </div>
                            {milestone.completed && (
                              <Badge variant="outline" className="text-primary border-primary">Completed</Badge>
                            )}
                          </div>
                        </CardHeader>
                      </Card>
                    </div>
                  )) : (
                    <div className="pl-8 text-muted-foreground italic">No milestones set yet.</div>
                  )}
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-display">Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {tasks?.slice(0, 5).map(task => (
                        <div key={task.id} className="flex items-start gap-3 text-sm pb-3 border-b last:border-0 last:pb-0">
                          <div className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${task.status === 'done' ? 'bg-green-500' : 'bg-amber-500'}`} />
                          <div>
                            <p className="font-medium text-foreground">{task.title}</p>
                            <p className="text-muted-foreground text-xs">Status: {task.status}</p>
                          </div>
                        </div>
                      ))}
                      {!tasks?.length && <p className="text-muted-foreground text-sm">No tasks tracked yet.</p>}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-primary text-primary-foreground border-none">
                  <CardHeader>
                    <CardTitle className="font-display">Contact Foreman</CardTitle>
                    <CardDescription className="text-primary-foreground/80">Need immediate assistance?</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="secondary" className="w-full text-primary font-bold">
                      Send Message
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="chat">
            <ChatTab projectId={projectId} />
          </TabsContent>

          <TabsContent value="photos">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
               {/* Placeholder gallery */}
               {[1,2,3,4].map((i) => (
                 <div key={i} className="aspect-square bg-secondary rounded-xl flex items-center justify-center text-muted-foreground">
                   <ImageIcon className="h-8 w-8 opacity-50" />
                 </div>
               ))}
               <div className="col-span-full text-center py-12 text-muted-foreground">
                 Photos feature coming soon.
               </div>
            </div>
          </TabsContent>

          <TabsContent value="docs">
            <div className="flex flex-col gap-2">
               <div className="bg-card border p-4 rounded-xl flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <FileText className="h-5 w-5 text-primary" />
                   <span className="font-medium">Contract.pdf</span>
                 </div>
                 <Button variant="ghost" size="sm">Download</Button>
               </div>
               <div className="text-center py-12 text-muted-foreground">
                 More documents will appear here as the project progresses.
               </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ChatTab({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const { data: messages, isLoading } = useMessages(projectId);
  const { mutate: sendMessage, isPending } = useSendMessage();
  const [content, setContent] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;

    sendMessage(
      { projectId, content, senderId: user.id || "unknown" }, // In real app, senderId comes from backend session usually, but schema requires it
      { onSuccess: () => setContent("") }
    );
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="border-b">
        <CardTitle className="font-display text-xl">Project Communication</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
            ) : messages?.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No messages yet. Start the conversation!</p>
            ) : (
              messages?.map((msg) => {
                const isMe = msg.senderId === user?.id; // Assuming user.id matches
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isMe ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
                      <p className="text-sm">{msg.content}</p>
                      <span className="text-[10px] opacity-70 block mt-1 text-right">
                        {msg.createdAt && format(new Date(msg.createdAt), "h:mm a")}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
        <div className="p-4 border-t bg-background">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type a message..." 
              className="flex-1"
            />
            <Button type="submit" disabled={isPending || !content.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
