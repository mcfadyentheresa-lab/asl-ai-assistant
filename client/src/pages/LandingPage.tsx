import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, Zap, Eye } from "lucide-react";
import { motion } from "framer-motion";
import heroImg from "@/assets/images/hero-cottage.png";
import craftImg from "@/assets/images/craft-interior.png";

export default function LandingPage() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Hero Section - Full viewport dark section */}
      <section className="relative h-screen min-h-[600px] flex flex-col">
        <img
          src={heroImg}
          alt="Luxury Muskoka cottage interior"
          className="absolute inset-0 h-full w-full object-cover"
          data-testid="img-hero"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />

        <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6" data-testid="nav-landing">
          <span className="font-serif text-2xl font-bold text-white tracking-tight" data-testid="text-logo">
            Aster & Spruce
          </span>
          <Button
            onClick={handleLogin}
            variant="outline"
            className="bg-white/10 backdrop-blur-md text-white border-white/20"
            data-testid="button-login"
          >
            Log In
          </Button>
        </nav>

        <div className="relative z-10 flex-1 flex items-center">
          <div className="container mx-auto px-6 md:px-12">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="max-w-2xl space-y-6"
            >
              <h1
                className="font-serif text-5xl md:text-7xl font-bold text-white leading-[1.1]"
                data-testid="text-hero-heading"
              >
                Crafting Timeless Spaces for Modern Living
              </h1>
              <p className="text-lg md:text-xl text-white/80 max-w-lg leading-relaxed">
                Bespoke cottage renovations in the heart of Muskoka. Transparent project management from blueprint to final walkthrough.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <Button
                  onClick={handleLogin}
                  size="lg"
                  data-testid="button-portal"
                >
                  View My Project
                  <ArrowRight className="ml-2" />
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Craftsmanship Section */}
      <section className="py-24 md:py-32 bg-background">
        <div className="container mx-auto px-6 md:px-12">
          <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="rounded-xl overflow-hidden">
                <img
                  src={craftImg}
                  alt="Muskoka craftsmanship detail"
                  className="w-full h-auto object-cover aspect-[4/5]"
                  data-testid="img-craft"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="space-y-6"
            >
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground">
                Our Approach
              </p>
              <h2
                className="font-serif text-3xl md:text-5xl font-bold text-foreground leading-tight"
                data-testid="text-craft-heading"
              >
                Where Heritage Meets Innovation
              </h2>
              <p className="text-muted-foreground leading-relaxed text-lg">
                Every Aster & Spruce project begins with deep respect for the land and the legacy of Muskoka architecture. We pair traditional craftsmanship with modern building science to create homes that endure for generations.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Our client portal keeps you connected to every decision, every milestone, and every detail of your build -- no matter where you are in the world.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-secondary/40">
        <div className="container mx-auto px-6 md:px-12">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-xl mx-auto mb-16"
          >
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-3">
              The Standard
            </p>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground" data-testid="text-features-heading">
              Built on Trust and Transparency
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-10">
            {[
              {
                icon: ShieldCheck,
                title: "Secure Documentation",
                desc: "Contracts, plans, and change orders in a secure digital vault accessible anytime.",
              },
              {
                icon: Eye,
                title: "Real-Time Visibility",
                desc: "Daily photo logs, milestone tracking, and live progress updates at your fingertips.",
              },
              {
                icon: Zap,
                title: "Budget Clarity",
                desc: "Transparent budget tracking ensures there are never any surprises on your invoice.",
              },
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1, duration: 0.5 }}
                className="space-y-4"
                data-testid={`feature-card-${idx}`}
              >
                <div className="h-10 w-10 rounded-md bg-foreground/5 flex items-center justify-center text-foreground">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="font-serif text-xl font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border" data-testid="footer">
        <div className="container mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="font-serif text-lg font-bold text-foreground">
            Aster & Spruce
          </span>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Aster & Spruce Construction. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
