import { Navbar } from '@/components/landing/navbar';
import { Hero } from '@/components/landing/hero';
import { Features } from '@/components/landing/features';
import { HowItWorks } from '@/components/landing/how-it-works';
import { UseCases } from '@/components/landing/use-cases';
import { FAQ } from '@/components/landing/faq';
import { CallToAction } from '@/components/landing/cta';
import { Footer } from '@/components/landing/footer';
export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <UseCases />
        <FAQ />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}
