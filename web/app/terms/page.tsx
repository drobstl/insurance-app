import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service - AgentForLife',
  description: 'Terms of Service for AgentForLife mobile app and web services',
};

export default function TermsOfServicePage() {
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
            <span className="text-xl font-bold text-white">AgentForLife</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8 md:p-12">
          <h1 className="text-3xl md:text-4xl font-bold text-[#0D4D4D] mb-2">Terms of Service</h1>
          <p className="text-[#6B7280] mb-8">Last Updated: January 2026</p>

          <div className="prose prose-lg max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">1. Agreement to Terms</h2>
              <p className="text-[#2D3748] leading-relaxed">
                By accessing or using AgentForLife ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of the Terms, you may not access the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">2. Description of Service</h2>
              <p className="text-[#2D3748] leading-relaxed">
                AgentForLife provides a platform for insurance agents to manage client relationships and share policy information with their clients through a mobile application. The Service includes:
              </p>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2 mt-4">
                <li>Web-based dashboard for insurance agents</li>
                <li>Mobile application for clients</li>
                <li>Client and policy management tools</li>
                <li>Agent profile customization</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">3. User Accounts</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                <strong>Agent Accounts:</strong> Insurance agents must create an account to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
              </p>
              <p className="text-[#2D3748] leading-relaxed">
                <strong>Client Access:</strong> Clients access the mobile app using a unique code provided by their insurance agent. Clients do not create separate accounts but access information through their agent's account.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">4. Subscription and Payment</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                The Service is offered on a subscription basis at $9.99 per month. By subscribing, you agree to:
              </p>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2">
                <li>Pay the subscription fee on a recurring monthly basis</li>
                <li>Provide accurate billing information</li>
                <li>Accept that payments are processed securely through Stripe</li>
              </ul>
              <p className="text-[#2D3748] leading-relaxed mt-4">
                You may cancel your subscription at any time through your account settings or Stripe customer portal. Cancellation will take effect at the end of your current billing period.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">5. Acceptable Use</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                You agree not to use the Service to:
              </p>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2">
                <li>Violate any applicable laws or regulations</li>
                <li>Upload false, misleading, or fraudulent information</li>
                <li>Infringe upon the rights of others</li>
                <li>Interfere with or disrupt the Service</li>
                <li>Attempt to gain unauthorized access to any part of the Service</li>
                <li>Use the Service for any purpose other than managing legitimate insurance client relationships</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">6. Data and Content</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                <strong>Your Data:</strong> You retain ownership of all data you upload to the Service. By using the Service, you grant us a license to store, process, and display your data as necessary to provide the Service.
              </p>
              <p className="text-[#2D3748] leading-relaxed">
                <strong>Accuracy:</strong> You are responsible for ensuring that all client and policy information you enter is accurate and up-to-date. AgentForLife is not responsible for errors in data you provide.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">7. Intellectual Property</h2>
              <p className="text-[#2D3748] leading-relaxed">
                The Service, including its original content, features, and functionality, is owned by AgentForLife and is protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works based on the Service without our express permission.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">8. Disclaimers</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
              </p>
              <p className="text-[#2D3748] leading-relaxed">
                AgentForLife is a client management tool and does not provide insurance advice, policy recommendations, or any insurance-related services. Insurance agents using the Service are solely responsible for their professional conduct and compliance with applicable insurance regulations.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">9. Limitation of Liability</h2>
              <p className="text-[#2D3748] leading-relaxed">
                To the maximum extent permitted by law, AgentForLife shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your use of the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">10. Termination</h2>
              <p className="text-[#2D3748] leading-relaxed">
                We may terminate or suspend your account and access to the Service immediately, without prior notice, for any reason, including breach of these Terms. Upon termination, your right to use the Service will immediately cease. All provisions of the Terms which should survive termination shall survive.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">11. Changes to Terms</h2>
              <p className="text-[#2D3748] leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify users of any material changes by posting the new Terms on this page and updating the "Last Updated" date. Your continued use of the Service after any changes constitutes acceptance of the new Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">12. Governing Law</h2>
              <p className="text-[#2D3748] leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">13. Contact Us</h2>
              <p className="text-[#2D3748] leading-relaxed">
                If you have any questions about these Terms, please contact us at:
              </p>
              <div className="mt-4 p-4 bg-[#F8F9FA] rounded-xl">
                <p className="text-[#0D4D4D] font-semibold">AgentForLife</p>
                <p className="text-[#2D3748]">Email: <a href="mailto:support@agentforlife.app" className="text-[#3DD6C3] hover:underline">support@agentforlife.app</a></p>
              </div>
            </section>

            <section className="mt-12 pt-8 border-t border-gray-200">
              <p className="text-[#6B7280] text-sm">
                By using AgentForLife, you acknowledge that you have read and understood these Terms of Service and agree to be bound by them.
              </p>
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
          <p className="text-white/60 text-sm">
            © 2026 AgentForLife. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

