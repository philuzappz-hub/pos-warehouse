import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ChangePassword() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter your account email.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast({
        title: "Passwords do not match",
        description: "Confirm password must match the new password.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // ✅ Re-auth with email + old password (works even if user was not logged in)
      const { data: signInRes, error: reauthErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: oldPassword,
      });

      if (reauthErr) {
        toast({
          title: "Invalid email or old password",
          description: reauthErr.message,
          variant: "destructive",
        });
        return;
      }

      if (!signInRes.session) {
        toast({
          title: "Login required",
          description: "Could not create session. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // ✅ Update password (requires a valid session)
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        toast({
          title: "Update failed",
          description: updateErr.message,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Password updated successfully" });

      // ✅ Optional but recommended: sign out after changing password
      await supabase.auth.signOut();

      navigate("/auth", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl text-white">Change Password</CardTitle>
          <CardDescription className="text-slate-400">
            Enter your email and old password to set a new one
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleChange} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-200">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                disabled={loading}
                required
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Old Password</Label>
              <Input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Confirm New Password</Label>
              <Input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                disabled={loading}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Update Password
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading}
              onClick={() => navigate("/auth")}
            >
              Back to Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}