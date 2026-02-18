import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GraduationCap, LogOut, MessageSquare, Calendar, LayoutDashboard, BookOpen, ClipboardList } from "lucide-react";

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const isActive = (path: string) => location.pathname === path;

  const navItems = profile?.role === "teacher"
    ? [
        { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { path: "/sessions", label: "Sessions", icon: Calendar },
        { path: "/availability", label: "Availability", icon: Calendar },
        { path: "/conversations", label: "Messages", icon: MessageSquare },
      ]
    : [
        { path: "/choose-test", label: "Book a Test", icon: BookOpen },
        { path: "/pending-requests", label: "Requests", icon: ClipboardList },
        { path: "/sessions", label: "Sessions", icon: Calendar },
        { path: "/conversations", label: "Messages", icon: MessageSquare },
      ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <Link to={profile?.role === "teacher" ? "/dashboard" : "/choose-test"} className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-hero">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold font-display text-foreground">Test Mentor</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link key={item.path} to={item.path}>
                <Button
                  variant={isActive(item.path) ? "default" : "ghost"}
                  size="sm"
                  className="gap-2"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-muted-foreground">
              {profile?.name}
            </span>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg">
        <div className="flex justify-around py-2">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path} className="flex flex-col items-center gap-0.5 p-2">
              <item.icon className={`h-5 w-5 ${isActive(item.path) ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-[10px] ${isActive(item.path) ? "text-primary font-medium" : "text-muted-foreground"}`}>
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>

      <main className="container py-6 pb-24 md:pb-6">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
