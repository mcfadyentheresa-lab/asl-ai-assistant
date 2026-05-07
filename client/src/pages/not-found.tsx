import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md border-border/70 shadow-lg">
        <CardContent className="space-y-5 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              We couldn't find that page. Return to the dashboard to continue managing your project.
            </p>
          </div>

          <p>
            <Button asChild data-testid="button-not-found-home">
              <Link href="/">Back to dashboard</Link>
            </Button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
