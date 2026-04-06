import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraduationCap, User, BookOpen, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FormError } from "@/components/ui/form-error";
import { PasswordRequirements } from "@/components/ui/password-requirements";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = loginSchema.extend({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
});

const AuthPage = () => {
  const { signIn, signUp, user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Signup state
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupRole, setSignupRole] = useState<AppRole>("student");
  const [signupTeacherKey, setSignupTeacherKey] = useState("");
  const [signupError, setSignupError] = useState<string | null>(null);

  const getHomeRouteForRole = (role: AppRole) => {
    if (role === "admin") return "/admin";
    if (role === "teacher") return "/dashboard";
    if (role === "student") return "/choose-test";
    return null;
  };

  if (user && profile) {
    const destination = getHomeRouteForRole(profile.role);
    if (destination) {
      return <Navigate to={destination} replace />;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Unsupported account role</CardTitle>
            <CardDescription>
              Your account role is not recognized by this app build. Contact support to fix your profile role.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const result = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!result.success) {
      setLoginError(result.error.errors[0].message);
      return;
    }
    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoading(false);
    if (error) {
      const msg = error.message.includes("Invalid login")
        ? "The email or password you entered is incorrect. Please try again."
        : error.message;
      setLoginError(msg);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    const result = signupSchema.safeParse({ email: signupEmail, password: signupPassword, name: signupName });
    if (!result.success) {
      setSignupError(result.error.errors[0].message);
      return;
    }
    if (signupRole === "teacher") {
      if (!signupTeacherKey.trim()) {
        setSignupError("Teacher access key is required.");
        return;
      }
    }
    setLoading(true);
    const { error } = await signUp(
      signupEmail,
      signupPassword,
      signupName,
      signupRole,
      signupRole === "teacher" ? signupTeacherKey.trim() : undefined
    );
    setLoading(false);
    if (error) {
      const normalizedMessage = String(error.message ?? "").toLowerCase();
      const msg = error.message.includes("already registered")
        ? "This email is already registered. Try logging in instead."
        : normalizedMessage.includes("invalid_teacher_invite_code") || normalizedMessage.includes("teacher invite")
          ? "The teacher access key is invalid. Please contact the platform administrator."
        : error.message;
      setSignupError(msg);
    } else {
      toast({
        title: "Account Created!",
        description: "Please check your email to verify your account, then log in.",
      });
      setTab("login");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-hero">
            <GraduationCap className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold font-display text-foreground">Test Mentor</h1>
          <p className="mt-2 text-muted-foreground">Find the right teacher for your test prep</p>
        </div>

        <Card className="glass-card">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Log In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="login" className="mt-0">
                <form onSubmit={handleLogin} className="space-y-4">
                  <FormError message={loginError} />
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input id="login-email" type="email" placeholder="you@example.com" value={loginEmail} onChange={(e) => { setLoginEmail(e.target.value); setLoginError(null); }} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input id="login-password" type="password" placeholder="••••••••" value={loginPassword} onChange={(e) => { setLoginPassword(e.target.value); setLoginError(null); }} required />
                  </div>
                  <div className="text-right">
                    <Link to="/auth/forgot-password" className="text-sm text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Logging in..." : "Log In"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSignup} className="space-y-4">
                  <FormError message={signupError} />
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input id="signup-name" placeholder="Your name" value={signupName} onChange={(e) => { setSignupName(e.target.value); setSignupError(null); }} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input id="signup-email" type="email" placeholder="you@example.com" value={signupEmail} onChange={(e) => { setSignupEmail(e.target.value); setSignupError(null); }} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input id="signup-password" type="password" placeholder="••••••••" value={signupPassword} onChange={(e) => { setSignupPassword(e.target.value); setSignupError(null); }} required />
                    <PasswordRequirements password={signupPassword} minLength={6} />
                  </div>

                  <div className="space-y-2">
                    <Label>I am a</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSignupRole("student")}
                        className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                          signupRole === "student"
                            ? "border-primary bg-accent"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <User className="h-6 w-6" />
                        <span className="text-sm font-medium">Student</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignupRole("teacher")}
                        className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                          signupRole === "teacher"
                            ? "border-primary bg-accent"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <BookOpen className="h-6 w-6" />
                        <span className="text-sm font-medium">Teacher</span>
                      </button>
                    </div>
                  </div>

                  {signupRole === "teacher" && (
                    <div className="space-y-2">
                      <Label htmlFor="signup-teacher-key">
                        <span className="flex items-center gap-1.5">
                          <KeyRound className="h-3.5 w-3.5" />
                          Teacher Key
                        </span>
                      </Label>
                      <Input
                        id="signup-teacher-key"
                        type="password"
                        placeholder="Enter your teacher access key"
                        value={signupTeacherKey}
                        onChange={(e) => { setSignupTeacherKey(e.target.value); setSignupError(null); }}
                        required
                      />
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default AuthPage;
