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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = loginSchema.extend({
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  fullName: z.string().min(2, "Name must be at least 2 characters"),
});

/**
 * Always prefer a stable public site URL for auth emails.
 * Put this in .env for Vercel:
 *   VITE_SITE_URL=https://your-app.vercel.app
 */
function getSiteUrl(): string {
  const env =
    (import.meta.env.VITE_SITE_URL as string | undefined) ||
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ||
    (import.meta.env.VITE_APP_URL as string | undefined) ||
    "";

  const v = String(env || "").trim().replace(/\/+$/, "");
  if (v && /^https?:\/\//i.test(v)) return v;

  return window.location.origin;
}

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupCompanyName, setSignupCompanyName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");

  const { signIn } = useAuth();

  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = loginSchema.safeParse({
      email: loginEmail,
      password: loginPassword,
    });

    if (!result.success) {
      toast({
        title: "Validation Error",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error, needsCompanySetup } = await signIn(loginEmail, loginPassword);

      if (error) {
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Welcome back!" });

      if (needsCompanySetup) {
        navigate("/setup-company", { replace: true });
        return;
      }

      navigate("/", { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = signupSchema.safeParse({
      email: signupEmail,
      password: signupPassword,
      fullName: signupName,
      companyName: signupCompanyName,
    });

    if (!result.success) {
      toast({
        title: "Validation Error",
        description: result.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // 1️⃣ Create auth user
      const redirectTo = `${getSiteUrl()}/`;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          emailRedirectTo: redirectTo,
          data: { full_name: signupName },
        },
      });

      if (signUpError) {
        const msg = signUpError.message || "Signup failed";
        if (msg.toLowerCase().includes("already registered")) {
          toast({
            title: "Account Exists",
            description: "This email is already registered. Please login.",
            variant: "destructive",
          });
          setTab("login");
        } else {
          toast({
            title: "Signup Failed",
            description: msg,
            variant: "destructive",
          });
        }
        return;
      }

      // If email confirmations are ON, a session may not exist yet
      const user = signUpData?.user;
      const session = signUpData?.session;

      if (!user || !session) {
        toast({
          title: "Account Created",
          description:
            "Please check your email to confirm your account, then login to finish setup.",
        });
        setTab("login");
        return;
      }

      // 2️⃣ Bootstrap first admin + company
      const { error: bootstrapError } = await (supabase as any).rpc("bootstrap_first_admin", {
        company_name: signupCompanyName,
        full_name: signupName,
      });

      if (bootstrapError) {
        toast({
          title: "Setup Failed",
          description: bootstrapError.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Account Created",
        description: "Admin account created. Welcome!",
      });

      navigate("/", { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ IMPORTANT: Change password requires a session (logged in).
  // So we check session first to avoid the "flash then return" behavior.
  const handleGoChangePassword = async () => {
    if (isLoading) return;

    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        toast({
          title: "Login required",
          description: "Please login first, then you can change your password.",
          variant: "destructive",
        });
        return;
      }

      navigate("/change-password");
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Could not check session",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl text-white">Building Materials</CardTitle>
          <CardDescription className="text-slate-400">Management System</CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-700">
              <TabsTrigger value="login" disabled={isLoading}>
                Login
              </TabsTrigger>
              <TabsTrigger value="signup" disabled={isLoading}>
                Sign Up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-slate-200">
                    Email
                  </Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-slate-200">
                    Password
                  </Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    required
                    disabled={isLoading}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Login
                </Button>

                {/* ✅ Change Password (no flashing) */}
                <Button
  type="button"
  variant="outline"
  className="w-full"
  disabled={isLoading}
  onClick={() => navigate("/change-password")}
>
  Change Password
</Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-company" className="text-slate-200">
                    Company Name
                  </Label>
                  <Input
                    id="signup-company"
                    type="text"
                    placeholder="Wemah Enterprise"
                    value={signupCompanyName}
                    onChange={(e) => setSignupCompanyName(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-slate-200">
                    Full Name
                  </Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="John Doe"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-slate-200">
                    Email
                  </Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-slate-200">
                    Password
                  </Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white"
                    required
                    disabled={isLoading}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}