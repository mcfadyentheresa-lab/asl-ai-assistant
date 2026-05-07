import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Camera, ArrowLeft, Save, KeyRound } from "lucide-react";
import { Link } from "wouter";

export default function Profile() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  // Change-password section state. Kept local to this page; the endpoint is
  // POST /api/auth/change-password and requires the current password.
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  // P2-5 — Honour ?returnTo=<path> on the back link so users land where they came
  // from. Falls back to "/" (dashboard). We sanitise: only same-origin paths.
  const returnTo = (() => {
    if (typeof window === "undefined") return "/";
    const raw = new URLSearchParams(window.location.search).get("returnTo");
    if (!raw) return "/";
    // Must be a relative path starting with "/" and NOT "//" (which would be a
    // protocol-relative URL to another host).
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  })();
  const backLabel = returnTo === "/" ? "Back to Dashboard" : "Back";

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phone: (user as any).phone || "",
      });
    }
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const initials =
    `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() || "U";
  const roleLabel =
    user.role === "admin" ? "Admin" : user.role === "crew" ? "Crew" : "Client";

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      toast({ title: "Profile updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/auth/profile-photo", {
        method: "PATCH",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload photo");
      toast({ title: "Profile photo updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const hasChanges =
    form.firstName !== (user.firstName || "") ||
    form.lastName !== (user.lastName || "") ||
    form.email !== (user.email || "") ||
    form.phone !== ((user as any).phone || "");

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 md:px-6 pt-8">
        <Link href={returnTo} data-testid="link-back-dashboard">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {backLabel}
          </Button>
        </Link>

        <h1 className="font-serif text-3xl font-bold mb-8" data-testid="text-profile-heading">
          Your Profile
        </h1>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Profile Photo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="relative group">
                  {/*
                    On touch devices the hover overlay is invisible, so we also
                    show a small persistent camera badge in the bottom-right of
                    the avatar. Fine-pointer devices keep the original
                    full-overlay-on-hover behaviour. The hidden file input is
                    triggered by either button.
                  */}
                  <style>{`
                    .profile-photo-overlay { opacity: 0; transition: opacity 200ms; }
                    .group:hover .profile-photo-overlay { opacity: 1; }
                    .profile-photo-badge { display: none; }
                    @media (pointer: coarse) {
                      .profile-photo-overlay { opacity: 0; }
                      .profile-photo-badge { display: flex; }
                    }
                  `}</style>
                  <Avatar className="h-24 w-24">
                    <AvatarImage
                      src={user.profileImageUrl || undefined}
                      alt={user.firstName || "User"}
                    />
                    <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
                  </Avatar>
                  <button
                    className="profile-photo-overlay absolute inset-0 flex items-center justify-center rounded-full bg-black/40 cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    data-testid="button-change-photo"
                    aria-label="Change profile photo"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    ) : (
                      <Camera className="h-6 w-6 text-white" />
                    )}
                  </button>
                  {/* Persistent badge for touch users — same target file input. */}
                  <button
                    className="profile-photo-badge absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full bg-foreground text-background shadow-md ring-2 ring-background cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    data-testid="button-change-photo-badge"
                    aria-label="Change profile photo"
                    type="button"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    data-testid="input-photo-upload"
                  />
                </div>
                <div>
                  <p className="text-sm text-foreground font-medium">
                    {user.firstName} {user.lastName}
                  </p>
                  <Badge variant="outline" className="mt-1 no-default-hover-elevate no-default-active-elevate">
                    {roleLabel}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    Tap the photo or camera badge to change it
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                    First Name
                  </label>
                  <Input
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    data-testid="input-profile-firstname"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                    Last Name
                  </label>
                  <Input
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    data-testid="input-profile-lastname"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                  Email
                </label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  type="email"
                  data-testid="input-profile-email"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                  Phone Number
                </label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                  data-testid="input-profile-phone"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Optional secondary contact for your project team.
                </p>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  data-testid="button-save-profile"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label htmlFor="profile-pw-current" className="text-sm font-medium text-muted-foreground mb-1.5 block">
                  Current password
                </label>
                <Input
                  id="profile-pw-current"
                  type="password"
                  autoComplete="current-password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  data-testid="input-pw-current"
                />
              </div>
              <div>
                <label htmlFor="profile-pw-new" className="text-sm font-medium text-muted-foreground mb-1.5 block">
                  New password
                </label>
                <Input
                  id="profile-pw-new"
                  type="password"
                  autoComplete="new-password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  data-testid="input-pw-new"
                />
                <p className="text-xs text-muted-foreground mt-1">Minimum 8 characters.</p>
              </div>
              <div>
                <label htmlFor="profile-pw-confirm" className="text-sm font-medium text-muted-foreground mb-1.5 block">
                  Confirm new password
                </label>
                <Input
                  id="profile-pw-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  data-testid="input-pw-confirm"
                />
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}
                  data-testid="button-change-password"
                  onClick={async () => {
                    if (pwNew.length < 8) {
                      toast({ title: "Password too short", description: "New password must be at least 8 characters.", variant: "destructive" });
                      return;
                    }
                    if (pwNew !== pwConfirm) {
                      toast({ title: "Passwords don't match", description: "New password and confirmation must match.", variant: "destructive" });
                      return;
                    }
                    setPwSaving(true);
                    try {
                      const res = await fetch("/api/auth/change-password", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.message || "Failed to change password");
                      toast({ title: "Password updated" });
                      setPwCurrent("");
                      setPwNew("");
                      setPwConfirm("");
                    } catch (err: any) {
                      toast({ title: "Error", description: err.message, variant: "destructive" });
                    } finally {
                      setPwSaving(false);
                    }
                  }}
                >
                  {pwSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4 mr-2" />
                  )}
                  Update password
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Account Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Role</p>
                  <p className="text-sm" data-testid="text-profile-role">{roleLabel}</p>
                </div>
                <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">
                  {roleLabel}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Member Since</p>
                <p className="text-sm" data-testid="text-profile-joined">
                  {user.createdAt
                    ? new Date(user.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "N/A"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
