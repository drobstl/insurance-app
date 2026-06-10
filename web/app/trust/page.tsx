import Link from 'next/link';

export const metadata = {
  title: 'Trust & Security - AgentForLife',
  description:
    'How AgentForLife protects your client data, helps you stay compliant, and keeps your book of business yours.',
};

export default function TrustPage() {
  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <header className="bg-[#0D4D4D] py-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#3DD6C3] rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="7" r="3" />
                <path d="M12 12c-3 0-5 2-5 4v2h10v-2c0-2-2-4-5-4z" />
                <circle cx="4" cy="10" r="2" opacity="0.7" />
                <circle cx="20" cy="10" r="2" opacity="0.7" />
                <path d="M6 10h3M15 10h3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.7" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white">AgentForLife™</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#0D4D4D] mb-2">
            Your Book. Your Compliance. Your Data.
          </h1>
          <p className="text-[#6B7280] mb-8">
            AgentForLife is built for the way you actually work — protecting the relationships you&apos;ve earned,
            helping you stay compliant, and keeping your client data safe and private.
          </p>

          <div className="prose prose-lg max-w-none">
            {/* Your book is yours */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">Your book is yours</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                You built your business one relationship at a time. The clients you&apos;ve written and the leads
                you&apos;ve earned are yours — and AgentForLife treats them that way. For the client data you enter,
                you are the data controller and we are simply your data processor.
              </p>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2">
                <li>You own and control the client data you put into the Service.</li>
                <li>We never claim ownership of your clients or your relationships.</li>
                <li>
                  <strong>
                    We will never use your client data to solicit, market to, or attempt to acquire your clients
                  </strong>{' '}
                  — for any purpose.
                </li>
                <li>
                  We never sell, license, or hand your data to anyone for marketing, lead generation, or client
                  acquisition.
                </li>
              </ul>
            </section>

            {/* Works alongside */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">Works alongside the business you already do</h2>
              <p className="text-[#2D3748] leading-relaxed">
                AgentForLife is a client-relationship and client-experience tool — not a carrier, not a marketing
                organization, and not a lead source. You keep writing business exactly where you write it today.
                AgentForLife simply helps you do it better: faster follow-up, stronger retention, and a more
                professional experience for the families you serve.
              </p>
            </section>

            {/* Compliance */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">Built to help you stay compliant</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                As a licensed agent, you carry real responsibilities around client data and outreach. AgentForLife is
                designed to help you meet them, not work around them:
              </p>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2">
                <li>
                  <strong>Human-initiated calling.</strong> Our dialer is click-to-call — you choose to call a specific
                  client, one at a time. It is not a random- or sequential-number autodialer.
                </li>
                <li>
                  <strong>Respecting opt-outs.</strong> When someone replies STOP, we suppress further messages to that
                  number and keep a record of the request.
                </li>
                <li>
                  <strong>A clear communication trail</strong> — the kind of record you&apos;d want if your compliance
                  were ever questioned.
                </li>
              </ul>
            </section>

            {/* Security */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">Your data is safe — and private</h2>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2">
                <li>
                  <strong>Encrypted</strong> at rest (AES-256) and in transit (TLS), on Google Cloud / Firebase
                  infrastructure.
                </li>
                <li>
                  <strong>Walled off to you.</strong> Each agent&apos;s data is isolated — other agents cannot see your
                  clients through the Service.
                </li>
                <li>
                  <strong>Never sold</strong> and never shared for marketing.
                </li>
                <li>
                  <strong>Enterprise-grade providers.</strong> We build on the same platforms trusted across financial
                  and technology companies — Google Cloud / Firebase, Stripe, and Vercel.
                </li>
                <li>
                  <strong>Limited internal access.</strong> Access to your data is restricted to what&apos;s necessary
                  to operate and support the Service.
                </li>
              </ul>
              <p className="text-[#2D3748] leading-relaxed mt-4">
                For full details, see our{' '}
                <Link href="/privacy" className="text-[#3DD6C3] hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            {/* Bringing your book in */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">Bringing your book into AgentForLife</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">Moving in is simple, and entirely on your terms:</p>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2">
                <li>
                  <strong>Upload what you already have.</strong> Bring a PDF or file of your clients and leads — we read
                  and organize it for you.
                </li>
                <li>
                  <strong>You&apos;re in control of what you bring.</strong> You confirm you have the right to upload and
                  use the data.
                </li>
                <li>
                  <strong>It stays yours.</strong> You can request a complete export of your data at any time.
                </li>
              </ul>
            </section>

            {/* FAQ */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">Honest answers</h2>

              <h3 className="text-lg font-semibold text-[#0D4D4D] mb-2">Do you own my clients or my data?</h3>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                No. Your book is yours. AgentForLife is a tool you use — we don&apos;t claim your relationships, and we
                never sell your data.
              </p>

              <h3 className="text-lg font-semibold text-[#0D4D4D] mb-2">
                Will AgentForLife work with how I already do business?
              </h3>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                Yes. AgentForLife sits alongside your existing carriers and organization. You keep writing business
                where you write it today.
              </p>

              <h3 className="text-lg font-semibold text-[#0D4D4D] mb-2">
                What about my agreements with my agency or upline?
              </h3>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                Those agreements are between you and your organization — we encourage you to read them and follow them.
                AgentForLife is built to help you manage the business and relationships that are yours.
              </p>

              <h3 className="text-lg font-semibold text-[#0D4D4D] mb-2">Can I get my data out?</h3>
              <p className="text-[#2D3748] leading-relaxed">
                Yes. You can request a complete export of your data at any time by contacting{' '}
                <a href="mailto:support@agentforlife.app" className="text-[#3DD6C3] hover:underline">
                  support@agentforlife.app
                </a>
                .
              </p>
            </section>

            {/* Contact */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">Questions about security or privacy?</h2>
              <div className="mt-4 p-4 bg-[#F8F9FA] rounded-xl">
                <p className="text-[#0D4D4D] font-semibold">AgentForLife</p>
                <p className="text-[#2D3748]">
                  Email:{' '}
                  <a href="mailto:support@agentforlife.app" className="text-[#3DD6C3] hover:underline">
                    support@agentforlife.app
                  </a>
                </p>
                <p className="text-[#2D3748] mt-1">
                  See also our{' '}
                  <Link href="/privacy" className="text-[#3DD6C3] hover:underline">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link href="/terms" className="text-[#3DD6C3] hover:underline">
                    Terms of Service
                  </Link>
                  .
                </p>
              </div>
            </section>
          </div>
        </div>

        {/* Back to Home */}
        <div className="mt-8 text-center">
          <Link href="/" className="text-[#3DD6C3] hover:text-[#2BB5A5] font-medium transition-colors">
            ← Back to Home
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[#0D4D4D] py-8 mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-white/60 text-sm">© 2026 AgentForLife. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
