import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Privacy = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-[720px] mx-auto px-6 py-16">
      <Link to="/auth" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10">
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
      <p className="text-muted-foreground text-sm mb-10">Effective Date: February 23, 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">1. Overview</h2>
          <p>This Privacy Policy explains how N00B Labs LLC ("we," "us," or "our") collects, uses, and protects information when you use N00B Portfolios (the "Service").</p>
          <p className="mt-2">By using the Service, you agree to this Privacy Policy.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">2. Information We Collect</h2>

          <h3 className="text-sm font-semibold text-foreground mt-4 mb-1">Account Information</h3>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Email address</li>
            <li>Account credentials</li>
            <li>Basic profile information (if provided)</li>
          </ul>

          <h3 className="text-sm font-semibold text-foreground mt-4 mb-1">Portfolio and Usage Data</h3>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Simulated trades</li>
            <li>Portfolio holdings</li>
            <li>Performance calculations</li>
            <li>Interaction and usage behavior within the app</li>
          </ul>

          <h3 className="text-sm font-semibold text-foreground mt-4 mb-1">Technical Information</h3>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>IP address</li>
            <li>Device and browser type</li>
            <li>Log data</li>
            <li>Cookies or session identifiers</li>
          </ul>

          <p className="mt-4">We do not collect Social Security numbers, brokerage credentials, or bank account numbers.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">3. How We Use Information</h2>
          <p>We use collected information to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
            <li>Provide and operate the Service</li>
            <li>Calculate and display portfolio performance</li>
            <li>Authenticate users</li>
            <li>Improve product features and user experience</li>
            <li>Maintain security and prevent abuse</li>
          </ul>
          <p className="mt-4">We do not sell personal information.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">4. Third-Party Services</h2>
          <p>We use third-party service providers to support the operation of the Service, including infrastructure hosting, database management, analytics, and market data services.</p>
          <p className="mt-2">These providers may process information on our behalf solely to operate and maintain the Service.</p>
          <p className="mt-2">We are not responsible for the privacy practices of third-party services beyond our control.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">5. Cookies and Tracking</h2>
          <p>We may use cookies or similar technologies to maintain sessions and improve functionality. You can control cookies through your browser settings.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">6. Data Security</h2>
          <p>We implement reasonable administrative and technical safeguards to protect information. However, no system can guarantee absolute security.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">7. Data Retention</h2>
          <p>We retain account and portfolio data while your account remains active. If you delete your account, associated data may be removed from active systems, subject to backup and legal retention requirements.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">8. Children's Privacy</h2>
          <p>The Service is not intended for individuals under 18 years of age.</p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground mb-2">9. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. Updates will be posted on this page with a revised Effective Date.</p>
        </section>
      </div>
    </div>
  </div>
);

export default Privacy;
