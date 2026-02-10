import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import MarathonDetailPage from "@/pages/MarathonDetail";
import MyFavoritesPage from "@/pages/MyFavorites";
import MyReviewsPage from "@/pages/MyReviews";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/marathons/:id" component={MarathonDetailPage} />
      <Route path="/my-favorites" component={MyFavoritesPage} />
      <Route path="/my-reviews" component={MyReviewsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
