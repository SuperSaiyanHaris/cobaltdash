import SEO from '../components/SEO';

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-neutral-900 mb-3">{title}</h2>
      <div className="text-neutral-700 leading-relaxed space-y-3">{children}</div>
    </div>
  );
}

export default function Refunds() {
  return (
    <>
      <SEO
        title="Refund Policy"
        description="ShinyPull's refund policy for Featured Listings and paid products."
      />

      <div className="min-h-screen bg-[#fafafa]">
        {/* Hero */}
        <div className="relative overflow-hidden border-b border-neutral-200 py-16">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-4xl font-extrabold text-neutral-900 mb-4">Refund Policy</h1>
            <p className="text-neutral-500">Last updated: February 28, 2026</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-8">
            <div className="prose max-w-none">

              <Section title="No Refunds">
                <p>
                  All purchases on ShinyPull are final. We do not offer refunds on monthly subscription
                  charges, partial billing periods, or renewals.
                </p>
                <p>
                  By subscribing, you acknowledge that you are purchasing access to a digital service
                  that is made available immediately upon payment.
                </p>
              </Section>

              <Section title="Cancellations">
                <p>
                  You can cancel your subscription at any time from your Account page. When you cancel,
                  your plan stays active until the end of the current billing period. You won't be
                  charged again after that.
                </p>
                <p>
                  Cancelling mid-cycle does not entitle you to a refund for the remaining days. Your
                  access continues until the period you already paid for ends.
                </p>
              </Section>

              <Section title="Technical Issues">
                <p>
                  If a verified technical failure on our end prevented you from accessing the service
                  for an extended period, contact us and we'll review it. These cases are handled
                  individually.
                </p>
              </Section>

              <Section title="Contact">
                <p>
                  Questions? Email <a href="mailto:shinypull@proton.me" className="text-indigo-600 hover:text-indigo-700">shinypull@proton.me</a>.
                </p>
              </Section>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
