import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, BookOpen, FileText, Languages, GraduationCap } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import type { Database } from "@/integrations/supabase/types";

type TestCategory = Database["public"]["Enums"]["test_category"];

const testCategories: { value: TestCategory; label: string; description: string; icon: React.ElementType }[] = [
  { value: "ITA_L2", label: "ITA L2", description: "Italian as second language certification", icon: Languages },
  { value: "TOLC", label: "TOLC", description: "Test OnLine CISIA — university admission", icon: GraduationCap },
  { value: "CENTS", label: "CENT'S", description: "Centro Linguistico certification", icon: FileText },
  { value: "CLA", label: "CLA", description: "Centro Linguistico Ateneo", icon: BookOpen },
];

const tolcSubtypes = ["I", "E", "F", "SU", "B", "S"];

const ChooseTestPage = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<TestCategory | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);

  const handleContinue = () => {
    if (!selectedCategory) return;
    if (selectedCategory === "TOLC" && !selectedSubtype) return;

    const params = new URLSearchParams({ category: selectedCategory });
    if (selectedSubtype) params.set("subtype", selectedSubtype);
    navigate(`/pick-datetime?${params.toString()}`);
  };

  const canContinue = selectedCategory && (selectedCategory !== "TOLC" || selectedSubtype);

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Choose Your Test</h1>
          <p className="mt-2 text-muted-foreground">Select the exam you're preparing for</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {testCategories.map((cat) => (
            <Card
              key={cat.value}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedCategory === cat.value
                  ? "ring-2 ring-primary bg-accent"
                  : "hover:border-primary/30"
              }`}
              onClick={() => {
                setSelectedCategory(cat.value);
                if (cat.value !== "TOLC") setSelectedSubtype(null);
              }}
            >
              <CardContent className="flex items-start gap-4 p-5">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  selectedCategory === cat.value ? "gradient-hero" : "bg-muted"
                }`}>
                  <cat.icon className={`h-5 w-5 ${selectedCategory === cat.value ? "text-primary-foreground" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <h3 className="font-semibold font-display">{cat.label}</h3>
                  <p className="text-sm text-muted-foreground">{cat.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedCategory === "TOLC" && (
          <div className="mt-6 animate-fade-in">
            <label className="mb-2 block text-sm font-medium">Select TOLC Subtype</label>
            <Select value={selectedSubtype ?? ""} onValueChange={setSelectedSubtype}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose subtype..." />
              </SelectTrigger>
              <SelectContent>
                {tolcSubtypes.map((s) => (
                  <SelectItem key={s} value={s}>
                    TOLC-{s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <Button onClick={handleContinue} disabled={!canContinue} size="lg" className="gap-2">
            Pick Date & Time <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default ChooseTestPage;
