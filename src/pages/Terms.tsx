import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Terms = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-[720px] mx-auto px-6 py-16">
      <Link to="/auth" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10">
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <h1 className="text-3xl font-bold tracking-tight mb-2">Terms of Service</h1>
      <p className="text-muted-foreground text-sm mb-10">Effective Date: February 23, 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using N00B Portfolios (the "Service"), you agree to these Terms of Service ("Terms"). If you do not agree, do not use the Service.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">2. About the Service</h2>
          <p>N00B Portfolios is an educational portfolio simulation and tracking experience designed to help users learn about investing concepts. Unless explicitly stated otherwise, trades and performance shown in the Service are simulated.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">3. No Investment Advice</h2>
          <p>The Service is provided for educational and informational purposes only. Nothing in the Service constitutes financial, investment, legal, or tax advice, and nothing is a recommendation to buy, sell, or hold any security or asset. You are solely responsible for your decisions.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">4. Market Data and Accuracy</h2>
          <p>Market data, quotes, charts, and other financial information may be provided by third-party sources and may be delayed, inaccurate, incomplete, or unavailable. We do not guarantee the accuracy, completeness, or timeliness of any data displayed.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">5. User Accounts and Security</h2>
          <p>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to provide accurate information and to notify us of any unauthorized use of your account.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">6. Acceptable Use</h2>
          <p>You agree not to misuse the Service, including by attempting to access systems without authorization, interfering with operation, scraping data at scale, abusing rate limits, or using the Service for unlawful purposes.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">7. Intellectual Property</h2>
          <p>The Service, including its design, text, graphics, logos, and software, is owned by N00B Labs LLC and is protected by intellectual property laws. You may not copy, modify, distribute, sell, or lease any part of the Service without our permission.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">8. Termination</h2>
          <p>We may suspend or terminate your access to the Service at any time if we reasonably believe you have violated these Terms or if necessary to protect the Service, users, or third parties.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">9. Disclaimers</h2>
          <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE." WE DISCLAIM ALL WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">10. Limitation of Liability</h2>
          <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, N00B LABS LLC WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE. IN ALL CASES, OUR TOTAL LIABILITY WILL NOT EXCEED $100.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">11. Changes to the Service or Terms</h2>
          <p>We may update the Service and these Terms from time to time. If we make changes, we will post the updated Terms on this page. Continued use after changes means you accept the updated Terms.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">12. Governing Law</h2>
          <p>These Terms are governed by the laws of the State of New York, without regard to conflict-of-law rules.</p>
        </section>
      </div>
    </div>
  </div>
);

export default Terms;
