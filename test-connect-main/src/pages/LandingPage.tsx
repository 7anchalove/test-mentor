import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  GraduationCap,
  BookOpen,
  Users,
  MessageSquare,
  ArrowRight,
  Calendar,
  UserPlus,
  Quote,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

const benefits = [
  {
    icon: Calendar,
    title: "Book by slot",
    description:
      "Pick your exam date and time. See which mentors are free and book instantly—no back-and-forth.",
  },
  {
    icon: Users,
    title: "Vetted mentors",
    description:
      "Teachers qualified for ITA L2, TOLC, CENT'S, and CLA. Real availability, real expertise.",
  },
  {
    icon: MessageSquare,
    title: "Chat in-app",
    description:
      "Prepare with your mentor via in-app messaging. One place for scheduling and support.",
  },
];

const steps = [
  {
    step: 1,
    icon: BookOpen,
    title: "Choose your test",
    description: "Select the exam you're preparing for—ITA L2, TOLC, CENT'S, or CLA.",
  },
  {
    step: 2,
    icon: Calendar,
    title: "Pick date & time",
    description: "Choose a slot that works for you. We show only mentors available then.",
  },
  {
    step: 3,
    icon: MessageSquare,
    title: "Connect & prepare",
    description: "Book your mentor and chat in-app to get ready for the big day.",
  },
];

const testimonials = [
  {
    quote:
      "Found a TOLC-I mentor in two minutes. The slot view is so clear—no more guessing who's free.",
    author: "Marco R.",
    role: "Student",
  },
  {
    quote:
      "I set my availability once and students book when it suits them. Game changer for my schedule.",
    author: "Elena B.",
    role: "Mentor",
  },
  {
    quote:
      "Finally a platform that respects both my time and my teacher's. Smooth from start to finish.",
    author: "Sofia T.",
    role: "Student",
  },
];

const faqs = [
  {
    q: "Which exams do you support?",
    a: "We support ITA L2, TOLC (all subtypes), CENT'S, and CLA. You choose your test when you sign up.",
  },
  {
    q: "How does availability work?",
    a: "Mentors set their weekly schedule and any time off. When you pick a date and time, you only see mentors who are free in that slot.",
  },
  {
    q: "Can I become a mentor?",
    a: "Yes. Sign up and choose the “Mentor” role. You’ll set your subjects, availability, and rates. Students can then find and book you.",
  },
  {
    q: "Is there a free trial?",
    a: "You can browse mentors and see availability for free. Booking and chat are available once you create an account.",
  },
  {
    q: "How do I contact support?",
    a: "Use the link in the footer or the help section in your account. We typically reply within 24 hours.",
  },
];

const LandingPage = () => {
  const { user, profile } = useAuth();

  if (user && profile) {
    return (
      <Navigate
        to={profile.role === "teacher" ? "/dashboard" : "/choose-test"}
        replace
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-card/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-hero">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold font-display text-foreground">
              Test Mentor
            </span>
          </Link>
          <Link to="/auth">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 py-16 sm:py-20 md:py-28 lg:py-32">
        <div className="absolute inset-0 gradient-hero opacity-[0.04]" />
        <div className="container relative mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6 sm:space-y-8"
          >
            <h1 className="text-4xl font-bold font-display leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Ace your exam with{" "}
              <span className="text-gradient-hero">
                the right mentor
              </span>
            </h1>
            <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg md:max-w-2xl">
              Choose your test, pick a slot, and connect with qualified mentors
              who are available when you need them. No guesswork—just book and
              prepare.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row sm:gap-4">
              <Link to="/student">
                <Button
                  size="lg"
                  className="w-full gap-2 text-base sm:w-auto"
                >
                  Find a Mentor <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/teacher">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full gap-2 text-base sm:w-auto"
                >
                  Become a Mentor <UserPlus className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-t border-border/50 bg-muted/30 px-4 py-16 sm:py-20 md:py-24">
        <div className="container mx-auto">
          <h2 className="text-center text-2xl font-bold font-display sm:text-3xl md:mb-2">
            Why Test Mentor?
          </h2>
          <p className="mx-auto mb-10 max-w-lg text-center text-muted-foreground sm:mb-12">
            Built for students and mentors who want clarity and control.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent">
                  <b.icon className="h-6 w-6 text-accent-foreground" />
                </div>
                <h3 className="mb-2 text-lg font-semibold font-display">
                  {b.title}
                </h3>
                <p className="text-sm text-muted-foreground">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/50 px-4 py-16 sm:py-20 md:py-24">
        <div className="container mx-auto">
          <h2 className="text-center text-2xl font-bold font-display sm:text-3xl md:mb-2">
            How it works
          </h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-muted-foreground sm:mb-14">
            Three steps from sign-up to your first session.
          </p>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.step}
                className="relative flex flex-col items-center text-center sm:items-start sm:text-left"
              >
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-hero text-lg font-bold text-primary-foreground">
                  {s.step}
                </div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent sm:mb-4">
                  <s.icon className="h-5 w-5 text-accent-foreground" />
                </div>
                <h3 className="mb-2 text-lg font-semibold font-display">
                  {s.title}
                </h3>
                <p className="text-sm text-muted-foreground">{s.description}</p>
                {s.step < steps.length && (
                  <div className="absolute -right-4 top-8 hidden text-muted-foreground/40 lg:block">
                    <ChevronRight className="h-8 w-8" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-border/50 bg-muted/30 px-4 py-16 sm:py-20 md:py-24">
        <div className="container mx-auto">
          <h2 className="text-center text-2xl font-bold font-display sm:text-3xl md:mb-2">
            What people say
          </h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-muted-foreground sm:mb-14">
            Students and mentors sharing their experience.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <div
                key={t.author}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <Quote className="mb-3 h-8 w-8 text-primary/40" />
                <p className="mb-4 text-sm text-foreground sm:text-base">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p className="font-medium text-foreground">{t.author}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border/50 px-4 py-16 sm:py-20 md:py-24">
        <div className="container mx-auto max-w-2xl">
          <h2 className="text-center text-2xl font-bold font-display sm:text-3xl md:mb-2">
            Frequently asked questions
          </h2>
          <p className="mx-auto mb-10 max-w-lg text-center text-muted-foreground sm:mb-12">
            Quick answers to common questions.
          </p>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/20 px-4 py-10 sm:py-12">
        <div className="container mx-auto">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-hero">
                <GraduationCap className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold font-display text-foreground">
                Test Mentor
              </span>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm">
              <Link
                to="/auth"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Get Started
              </Link>
              <Link
                to="/auth"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign In
              </Link>
              <a
                href="#"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Support
              </a>
              <a
                href="#"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Privacy
              </a>
            </nav>
          </div>
          <div className="mt-8 border-t border-border/50 pt-8 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Test Mentor. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
