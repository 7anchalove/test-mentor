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
  const [invalidCode, setInvalidCode] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const queryParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
        const hashParams = new URLSearchParams(hash);

        const errorDescription =
          hashParams.get("error_description") || queryParams.get("error_description");
        const errorCode = hashParams.get("error_code") || queryParams.get("error_code");
        if (errorDescription) {
          const readableError = decodeURIComponent(errorDescription.replace(/\+/g, " "));
          if (mounted) {
            setInvalidMessage(readableError);
            setInvalidCode(errorCode ?? null);
            setCanReset(false);
          }
          return;
        }

        const code = queryParams.get("code");
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            if (mounted) {
              setInvalidMessage("Link invalid/expired, request a new reset link.");
              setInvalidCode(error.name || "exchange_code_failed");
              setCanReset(false);
            }
            return;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            if (mounted) {
              setInvalidMessage("Link invalid/expired, request a new reset link.");
              setInvalidCode(error.name || "set_session_failed");
              setCanReset(false);
            }
            return;
          }
        }

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData.user) {
          if (mounted) {
            setInvalidMessage("Link invalid/expired, request a new reset link.");
            setInvalidCode(userErr?.name || "missing_user");
            setCanReset(false);
          }
          return;
        }

        if (mounted) {
          setCanReset(true);
        }
      } catch {
        if (mounted) {
          setInvalidMessage("Link invalid/expired, request a new reset link.");
          setInvalidCode("unexpected_error");
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
    if (password.length < 8) return "Password must be at least 8 characters";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  }, [password, confirmPassword]);

  const handleBackToLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);

    if (error) {
      toast({
        title: "Could not clear session",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    navigate("/auth", { replace: true });
  };

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
            <CardDescription>Use at least 8 characters.</CardDescription>
          </CardHeader>
          <CardContent>
            {checkingSession ? (
              <p className="text-sm text-muted-foreground">Validating reset link...</p>
            ) : invalidMessage ? (
              <div className="space-y-4">
                <p className="text-sm text-destructive">{invalidMessage}</p>
                {invalidCode ? (
                  <p className="text-xs text-muted-foreground">Error code: {invalidCode}</p>
                ) : null}
                <Link to="/auth/forgot-password">
                  <Button className="w-full">Request new reset link</Button>
                </Link>
              </div>
            ) : success ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Changes made successfully</p>
                <Button className="w-full" onClick={handleBackToLogin} disabled={loading}>
                  {loading ? "Returning..." : "Back to login"}
                </Button>
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
                  {loading ? "Saving..." : "Save changes"}
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
