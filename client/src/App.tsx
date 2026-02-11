import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import MarathonDetailPage from "@/pages/MarathonDetail";
import MyFavoritesPage from "@/pages/MyFavorites";
import ProfilePage from "@/pages/Profile";
import MyReviewsPage from "@/pages/MyReviews";
import AdminDataPage from "@/pages/AdminData";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/marathons/:id" component={MarathonDetailPage} />
      <Route path="/my-favorites" component={MyFavoritesPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/my-reviews" component={MyReviewsPage} />
      <Route path="/admin/data" component={AdminDataPage} />
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
