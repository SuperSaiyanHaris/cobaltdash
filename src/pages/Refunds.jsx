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
        description="ShinyPull's refund policy for Featured Listings."
      />

      <div className="min-h-screen bg-[#fafaf9]">
        {/* Header — white block, hairline rule, typographic */}
        <div className="bg-white border-b border-neutral-200/80">
          <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14 text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 mb-3">Legal</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">Refund Policy</h1>
            <p className="mt-2 text-sm text-neutral-500">Last updated: July 16, 2026</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-8">
            <div className="prose max-w-none">

              <Section title="No Refunds">
                <p>
                  ShinyPull's browsing, search, rankings, and dashboard features are free to use. The
                  only paid purchase on ShinyPull is a Featured Listing, a monthly placement in our
                  rankings tables. All Featured Listing charges are final. We do not offer refunds on
                  monthly charges, partial billing periods, or renewals.
                </p>
                <p>
                  By purchasing a Featured Listing, you acknowledge that you are purchasing a placement
                  that goes live immediately upon payment.
                </p>
              </Section>

              <Section title="Cancellations">
                <p>
                  You can cancel a Featured Listing at any time from your Account page. When you cancel,
                  the listing stays active until the end of the current billing period. You won't be
                  charged again after that.
                </p>
                <p>
                  Cancelling mid-cycle does not entitle you to a refund for the remaining days. Your
                  listing stays live until the period you already paid for ends.
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
