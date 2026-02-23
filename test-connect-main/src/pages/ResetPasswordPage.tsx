import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            if (mounted) {
              setInvalidMessage("This reset link is invalid or expired. Request a new one.");
              setCanReset(false);
            }
          } else if (mounted) {
            setCanReset(true);
          }
        } else {
          const { data } = await supabase.auth.getSession();
          if (mounted) {
            if (data.session) {
              setCanReset(true);
            } else {
              setInvalidMessage("Missing or expired reset tokens. Request a new reset link.");
              setCanReset(false);
            }
          }
        }
      } catch {
        if (mounted) {
          setInvalidMessage("Could not validate reset session. Request a new reset link.");
          setCanReset(false);
        }
      } finally {
        if (mounted) setCheckingSession(false);
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const passwordError = useMemo(() => {
    if (!password && !confirmPassword) return null;
    if (password.length < 6) return "Password must be at least 6 characters";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  }, [password, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canReset) return;
    if (passwordError) {
      toast({ title: "Validation Error", description: passwordError, variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast({
        title: "Could not reset password",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setSuccess(true);
    toast({
      title: "Password updated",
      description: "Your password has been reset successfully.",
    });

    setTimeout(() => {
      navigate("/auth", { replace: true });
    }, 1500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-hero">
            <GraduationCap className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold font-display text-foreground">Reset Password</h1>
          <p className="mt-2 text-muted-foreground">Choose a new secure password.</p>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Set new password</CardTitle>
            <CardDescription>Use at least 6 characters.</CardDescription>
          </CardHeader>
          <CardContent>
            {checkingSession ? (
              <p className="text-sm text-muted-foreground">Validating reset link...</p>
            ) : invalidMessage ? (
              <div className="space-y-4">
                <p className="text-sm text-destructive">{invalidMessage}</p>
                <Link to="/auth/forgot-password">
                  <Button className="w-full">Request new reset link</Button>
                </Link>
              </div>
            ) : success ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Password updated. Redirecting to login...</p>
                <Link to="/auth">
                  <Button className="w-full">Go to Log In</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                {passwordError ? <p className="text-sm text-destructive">{passwordError}</p> : null}

                <Button type="submit" className="w-full" disabled={loading || Boolean(passwordError)}>
                  {loading ? "Updating..." : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
