import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, ShieldCheck, Zap } from "lucide-react";
import { motion } from "framer-motion";

export default function LandingPage() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex h-20 items-center justify-between px-6 md:px-12 backdrop-blur-md bg-background/80 border-b border-border/40">
        <div className="text-2xl font-display font-bold text-primary">Aster & Spruce</div>
        <Button onClick={handleLogin} variant="outline" className="font-medium">
          Client Login
        </Button>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6">
        <div className="absolute inset-0 z-0 overflow-hidden opacity-10 pointer-events-none">
           <div className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full bg-primary blur-[120px]" />
           <div className="absolute top-[40%] -left-[10%] w-[400px] h-[400px] rounded-full bg-accent blur-[100px]" />
        </div>

        <div className="container mx-auto relative z-10 grid gap-12 lg:grid-cols-2 items-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <h1 className="text-5xl md:text-7xl font-display font-bold leading-[1.1] text-primary">
              Building Dreams,<br />
              <span className="text-accent italic">Crafting Legacy.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed">
              Experience the transparency of modern construction management combined with the timeless quality of Muskoka craftsmanship.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={handleLogin} size="lg" className="h-14 px-8 text-lg rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all">
                Access Client Portal
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" size="lg" className="h-14 px-8 text-lg rounded-full border-2">
                View Our Portfolio
              </Button>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            {/* Modern cabin living room with large windows overlooking lake */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-primary/20 aspect-[4/3]">
              <img 
                src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?q=80&w=1974&auto=format&fit=crop" 
                alt="Modern luxury cottage interior with lake view" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-transparent" />
              
              <div className="absolute bottom-6 left-6 right-6 p-6 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-white/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold tracking-wider uppercase text-accent">Latest Project</span>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="w-1 h-1 rounded-full bg-primary/20" />
                    ))}
                  </div>
                </div>
                <h3 className="font-display text-lg font-semibold text-primary">The Lakeside Retreat</h3>
                <p className="text-sm text-muted-foreground">Muskoka Lakes, ON • Completed Fall 2024</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-primary mb-4">The Aster & Spruce Standard</h2>
            <p className="text-muted-foreground">We believe in complete transparency. Our client portal keeps you connected to your project from anywhere in the world.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: ShieldCheck,
                title: "Secure Documentation",
                desc: "Access contracts, plans, and change orders instantly in a secure digital vault."
              },
              {
                icon: Zap,
                title: "Real-Time Updates",
                desc: "Watch your vision come to life with daily photo logs and milestone tracking."
              },
              {
                icon: CheckCircle2,
                title: "Budget Clarity",
                desc: "Live budget tracking ensures there are never any surprises on your invoice."
              }
            ].map((feature, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="p-8 rounded-2xl bg-secondary/30 hover:bg-secondary/50 transition-colors border border-transparent hover:border-border"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-6">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="font-display text-xl font-semibold text-primary mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary text-primary-foreground py-12">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-2xl font-display font-bold">Aster & Spruce</div>
          <div className="text-sm opacity-60">
            © {new Date().getFullYear()} Aster & Spruce Construction. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
