import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FormError } from "@/components/ui/form-error";
import { PasswordRequirements } from "@/components/ui/password-requirements";

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
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Validating your reset link…
              </div>
            ) : invalidMessage ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-destructive">This link is no longer valid</p>
                    <p className="text-sm text-muted-foreground">
                      Reset links expire for your security. Please request a new one.
                    </p>
                    {invalidCode ? (
                      <p className="text-xs text-muted-foreground/70">Reference: {invalidCode}</p>
                    ) : null}
                  </div>
                </div>
                <Link to="/auth/forgot-password">
                  <Button className="w-full">Request new reset link</Button>
                </Link>
              </div>
            ) : success ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">Password updated successfully!</p>
                    <p className="text-sm text-muted-foreground">You can now log in with your new password.</p>
                  </div>
                </div>
                <Button className="w-full" onClick={handleBackToLogin} disabled={loading}>
                  {loading ? "Returning…" : "Back to login"}
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
                  <PasswordRequirements password={password} minLength={8} />
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

                <FormError message={passwordError} />

                <Button type="submit" className="w-full" disabled={loading || Boolean(passwordError)}>
                  {loading ? "Saving…" : "Save changes"}
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
