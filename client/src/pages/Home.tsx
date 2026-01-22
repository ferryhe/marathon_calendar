import { useState } from "react";
import { MarathonTable } from "@/components/MarathonTable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [region, setRegion] = useState<"China" | "Overseas">("China");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const handleUpdate = () => {
    setIsUpdating(true);
    // Simulate API call/Search
    setTimeout(() => {
      setIsUpdating(false);
      toast({
        title: "Calendar Updated",
        description: "Successfully fetched latest marathon data from verified sources.",
      });
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Hero Section */}
      <header className="relative h-[240px] w-full overflow-hidden bg-zinc-900">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-60 mix-blend-overlay"
          style={{ backgroundImage: 'url("/marathon-hero.png")' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        
        <div className="container relative mx-auto h-full flex flex-col justify-end pb-8 px-4 sm:px-6">
          <div className="flex items-center gap-3 mb-2 text-primary">
             <Trophy className="h-6 w-6" />
             <span className="text-sm font-semibold tracking-wider uppercase">Global Tracker</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            Marathon Calendar
          </h1>
          <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
            Track major running events across China and the globe.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-6">
          
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <Tabs 
              value={region} 
              onValueChange={(v) => setRegion(v as "China" | "Overseas")} 
              className="w-full sm:w-auto"
            >
              <TabsList className="grid w-full grid-cols-2 sm:w-[300px]">
                <TabsTrigger value="China">China Events</TabsTrigger>
                <TabsTrigger value="Overseas">Overseas Events</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex w-full sm:w-auto gap-2 items-center">
              <div className="relative flex-1 sm:w-[300px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by name or city..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={handleUpdate} 
                disabled={isUpdating}
                className={isUpdating ? "animate-spin" : ""}
                title="Update from web"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Table */}
          <MarathonTable region={region} searchQuery={searchQuery} />
          
        </div>
      </main>
    </div>
  );
}
