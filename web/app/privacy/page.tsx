import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy - AgentForLife',
  description: 'Privacy Policy for AgentForLife mobile app and web services',
};

export default function PrivacyPolicyPage() {
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
          <h1 className="text-3xl md:text-4xl font-bold text-[#0D4D4D] mb-2">Privacy Policy</h1>
          <p className="text-[#6B7280] mb-8">Last Updated: January 2026</p>

          <div className="prose prose-lg max-w-none">
            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">1. Introduction</h2>
              <p className="text-[#2D3748] leading-relaxed">
                AgentForLife ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and web services (collectively, the "Service").
              </p>
              <p className="text-[#2D3748] leading-relaxed mt-4">
                By using the Service, you agree to the collection and use of information in accordance with this policy.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">2. Information We Collect</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                We collect information that you provide directly to us when using our Service:
              </p>
              <h3 className="text-lg font-semibold text-[#0D4D4D] mb-2">For Insurance Agents:</h3>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2 mb-4">
                <li>Name and contact information (email address, phone number)</li>
                <li>Agency name and logo</li>
                <li>Profile photo</li>
                <li>Account credentials</li>
                <li>Payment information (processed securely through Stripe)</li>
              </ul>
              <h3 className="text-lg font-semibold text-[#0D4D4D] mb-2">For Clients:</h3>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2">
                <li>Name and contact information (email address, phone number)</li>
                <li>Insurance policy information (policy type, coverage amounts, premium amounts, renewal dates, beneficiary information)</li>
                <li>Client access codes</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">3. How We Use Your Information</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                We use the information we collect to:
              </p>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2">
                <li>Provide, operate, and maintain our Service</li>
                <li>Enable insurance agents to manage their client relationships</li>
                <li>Allow clients to view their policy information and contact their agent</li>
                <li>Process subscription payments</li>
                <li>Send you service-related communications</li>
                <li>Respond to your comments, questions, and requests</li>
                <li>Improve and develop new features for our Service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">4. Data Storage and Security</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                We use industry-standard security measures to protect your information:
              </p>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2">
                <li><strong>Firebase (Google Cloud):</strong> Your data is stored securely using Google Firebase, which provides enterprise-grade security including encryption at rest and in transit.</li>
                <li><strong>Stripe:</strong> All payment information is processed securely through Stripe. We do not store your credit card details on our servers.</li>
                <li><strong>Authentication:</strong> We use Firebase Authentication to secure user accounts with industry-standard practices.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">5. Information Sharing</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
              </p>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2">
                <li><strong>With Service Providers:</strong> We share information with Firebase (data storage) and Stripe (payment processing) to operate our Service.</li>
                <li><strong>Agent-Client Relationship:</strong> Client information is shared with the insurance agent who created the client account, and agent information is shared with their clients through the mobile app.</li>
                <li><strong>Legal Requirements:</strong> We may disclose information if required by law or to protect our rights, safety, or property.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">6. Your Rights and Choices</h2>
              <p className="text-[#2D3748] leading-relaxed mb-4">
                You have the following rights regarding your personal information:
              </p>
              <ul className="list-disc list-inside text-[#2D3748] space-y-2">
                <li><strong>Access:</strong> You can access your personal information through your account settings.</li>
                <li><strong>Correction:</strong> You can update or correct your information at any time.</li>
                <li><strong>Deletion:</strong> You can request deletion of your account and associated data by contacting us.</li>
                <li><strong>Data Portability:</strong> You can request a copy of your data in a portable format.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">7. Data Retention</h2>
              <p className="text-[#2D3748] leading-relaxed">
                We retain your personal information for as long as your account is active or as needed to provide you with our Service. If you delete your account, we will delete your personal information within 30 days, except where we are required to retain it for legal or regulatory purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">8. Children's Privacy</h2>
              <p className="text-[#2D3748] leading-relaxed">
                Our Service is not intended for children under 18 years of age. We do not knowingly collect personal information from children under 18. If we learn that we have collected personal information from a child under 18, we will delete that information promptly.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">9. Changes to This Privacy Policy</h2>
              <p className="text-[#2D3748] leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date. We encourage you to review this Privacy Policy periodically for any changes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-bold text-[#0D4D4D] mb-4">10. Contact Us</h2>
              <p className="text-[#2D3748] leading-relaxed">
                If you have any questions about this Privacy Policy or our data practices, please contact us at:
              </p>
              <div className="mt-4 p-4 bg-[#F8F9FA] rounded-xl">
                <p className="text-[#0D4D4D] font-semibold">AgentForLife</p>
                <p className="text-[#2D3748]">Email: <a href="mailto:support@agentforlife.app" className="text-[#3DD6C3] hover:underline">support@agentforlife.app</a></p>
              </div>
            </section>

            <section className="mt-12 pt-8 border-t border-gray-200">
              <p className="text-[#6B7280] text-sm">
                By using AgentForLife, you acknowledge that you have read and understood this Privacy Policy and agree to its terms.
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

