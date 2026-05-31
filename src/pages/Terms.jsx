import SEO from '../components/SEO';

export default function Terms() {
  return (
    <>
      <SEO
        title="Terms of Service"
        description="Read the ShinyPull Terms of Service to understand the rules and regulations for using our platform."
      />

      <div className="min-h-screen bg-[#fafafa]">
        {/* Hero */}
        <div className="relative overflow-hidden border-b border-neutral-200 py-16">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h1 className="text-4xl font-extrabold text-neutral-900 mb-4">Terms of Service</h1>
            <p className="text-neutral-500">Last updated: March 1, 2026</p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-8">
            <div className="prose max-w-none">
              <p className="text-neutral-700 mb-8 leading-relaxed">
                This is the terms of use agreement (the "Agreement") that governs your use of ShinyPull's website
                and data. If you do not agree with these terms, please stop using ShinyPull's website and refrain
                from using our data.
              </p>

              <Section title="General Terms">
                <p className="mb-4">
                  ShinyPull may change any of the terms and conditions in this Agreement at any time for any reason.
                  A notice of material change will be posted on ShinyPull's website, and you are responsible for
                  reviewing the changes. If you do not agree with them, do not continue to use ShinyPull's website
                  and refrain from using our data.
                </p>
                <p className="mb-4">
                  ShinyPull does not provide any guarantee or warranty of the accuracy of any data. By using
                  ShinyPull, you are certifying that you are over 13 years of age and have your legal guardian's
                  permission if you are under 18.
                </p>
                <p>
                  The data ShinyPull provides is public information. It is gathered by ShinyPull's proprietary
                  software from 3rd party sources. The data is then collated, organized, manipulated, and displayed
                  in unique ways by ShinyPull. This makes the data proprietary.
                </p>
              </Section>

              <Section title="Data Rights">
                <p className="mb-4">
                  Sharing ShinyPull's data, including screen shots or images of ShinyPull's website, is allowed
                  providing you credit ShinyPull as the source of said data and/or images. The acceptable way to
                  do this is to provide a link back to the source of the data, and clearly state in text that
                  ShinyPull provides the data. This includes sharing our data on social media websites, on blogs,
                  and in any sort of publication.
                </p>
                <p className="mb-4">
                  Data that is shared from ShinyPull on YouTube videos should include a link in the description,
                  and a verbal or written acknowledgement of ShinyPull as the source of the data in the video itself.
                </p>
                <p>
                  <strong>Mass copying data from ShinyPull's website (to include botting, crawling, scraping, etc.)
                  is not allowed</strong> and may result in you being blocked from ShinyPull's website and data.
                  The only way you may gather large amounts of data is by requesting data directly from ShinyPull
                  (email our staff at{' '}
                  <a href="mailto:shinypull@proton.me" className="text-indigo-600 hover:text-indigo-300">
                    shinypull@proton.me
                  </a>
                  ).
                </p>
              </Section>

              <Section title="Data Policy - Creator Profile Removal">
                <p className="mb-4">
                  <strong>It is ShinyPull's policy to not delete data on our website.</strong> All the data on our
                  website is gathered from public sources, and ShinyPull will continue to display said data. If you
                  want us to stop displaying the statistics of your channel/account from a third party (e.g. YouTube,
                  Twitch, TikTok, Kick), you will have to adjust your privacy settings on said third party website.
                </p>
                <p className="mb-4">
                  Again just to reinstate, the data shown on ShinyPull is the same public data anyone could get by
                  visiting your profile on various social media sites and writing it down. We do not display private
                  data. If we were to delete or change any of the data shown it would ruin our journalistic/encyclopedic
                  integrity.
                </p>
                <p>
                  <strong>If you want a private social media profile simply mark it as private on that site and we
                  won't collect its public data, otherwise we will.</strong>
                </p>
              </Section>

              <Section title="Data Sources">
                <p>
                  ShinyPull displays statistics that are publicly available on the platforms we track. We only
                  gather information that anyone can already see on a creator's public profile or page. We do not
                  access or store private account data. If you have a question about the data we show, contact us at{' '}
                  <a href="mailto:shinypull@proton.me" className="text-indigo-600 hover:text-indigo-300">
                    shinypull@proton.me
                  </a>.
                </p>
              </Section>

              <Section title="Description of Service">
                <p>
                  ShinyPull provides social media analytics and statistics for content creators across multiple
                  platforms. We display publicly available data and present it as charts, rankings, and historical
                  trends.
                </p>
              </Section>

              <Section title="User Accounts">
                <p className="mb-2">When creating an account, you agree to:</p>
                <ul className="list-disc list-inside text-neutral-700 space-y-1">
                  <li>Provide accurate and complete information</li>
                  <li>Maintain the security of your account credentials</li>
                  <li>Notify us immediately of any unauthorized access</li>
                  <li>Be responsible for all activities under your account</li>
                </ul>
              </Section>

              <Section title="Data Accuracy">
                <p>
                  While we strive to provide accurate statistics, we cannot guarantee 100% accuracy. Data is
                  collected from publicly available sources and may be subject to delays, errors, or inconsistencies.
                  Earnings estimates are approximations based on industry averages and should not be considered
                  exact figures.
                </p>
              </Section>

              <Section title="Live Counter Estimates">
                <p className="mb-4">
                  Our "Live Counter" feature displays <strong>estimated</strong> real-time subscriber and follower
                  counts. These numbers are simulations based on:
                </p>
                <ul className="list-disc list-inside text-neutral-700 space-y-1 mb-4">
                  <li>The most recent publicly available count from the platform</li>
                  <li>Typical growth patterns for channels of similar size</li>
                  <li>Statistical modeling to simulate realistic fluctuations</li>
                </ul>
                <p className="mb-4">
                  <strong>Important:</strong> The live counter does NOT display the actual real-time count from
                  YouTube or Twitch. Platform APIs only provide rounded/cached subscriber counts (e.g., "465M"
                  instead of "465,523,243"). The additional digits shown are algorithmic estimates for
                  entertainment purposes.
                </p>
                <p>
                  For the most accurate counts, please refer to the official platform (YouTube Studio, Twitch Dashboard).
                  ShinyPull is not responsible for any decisions made based on these estimated figures.
                </p>
              </Section>

              <Section title="Acceptable Use">
                <p className="mb-2">You agree NOT to:</p>
                <ul className="list-disc list-inside text-neutral-700 space-y-1">
                  <li>Use automated tools to scrape or download data without permission</li>
                  <li>Attempt to access unauthorized areas of the service</li>
                  <li>Interfere with or disrupt the service</li>
                  <li>Violate any applicable laws or regulations</li>
                  <li>Use the service for any unlawful purpose</li>
                  <li>Impersonate others or misrepresent your affiliation</li>
                </ul>
              </Section>

              <Section title="Intellectual Property">
                <p>
                  All content, features, and functionality of ShinyPull are owned by us and protected by
                  international copyright, trademark, and other intellectual property laws. Creator statistics
                  and public data are owned by their respective platforms and creators.
                </p>
              </Section>

              <Section title="Third-Party Platforms">
                <p>
                  Our service relies on publicly available data from the platforms we track. We are not affiliated
                  with these platforms. Changes to their services or terms may affect ours.
                </p>
              </Section>

              <Section title="Limitation of Liability">
                <p>
                  ShinyPull is provided "as is" without warranties of any kind. We shall not be liable
                  for any indirect, incidental, special, consequential, or punitive damages resulting from
                  your use or inability to use the service.
                </p>
              </Section>

              <Section title="Service Modifications">
                <p>
                  We reserve the right to modify, suspend, or discontinue any part of our service at any
                  time without notice. We may also update these Terms of Service periodically.
                </p>
              </Section>

              <Section title="Termination">
                <p>
                  We may terminate or suspend your account and access to the service at our sole discretion,
                  without notice, for conduct that violates these Terms or is harmful to other users.
                </p>
              </Section>

              <Section title="Subscription Plans and Historical Data">
                <p className="mb-4">
                  ShinyPull offers paid subscription plans (Sub and Mod) that include access to historical
                  statistics. The availability of historical data depends on two factors: when ShinyPull
                  launched data collection, and when a specific creator was first added to the platform.
                </p>
                <p className="mb-4">
                  ShinyPull launched data collection in February 2026. No historical data exists prior to
                  that date, regardless of subscription tier. Additionally, individual creators are tracked
                  from the date they first appear in ShinyPull search results or when their profile page is
                  first viewed on the platform. A creator added in June 2026 will only have data from June
                  2026 onward, even for Mod subscribers.
                </p>
                <p className="mb-4">
                  Subscription plan descriptions referencing "1 year of history" or "full history" refer to
                  the maximum data range ShinyPull will make available as data accumulates over time, not a
                  guarantee that data exists for any specific creator or prior time period.
                </p>
                <p className="mb-4">
                  As the platform matures and more data is collected, longer historical ranges will become
                  available to subscribers at or above the applicable tier. ShinyPull makes no representation
                  that historical data predating the platform's launch or a creator's first appearance on
                  ShinyPull will ever be available.
                </p>
                <p>
                  Subscriptions are sold based on access to features and data ranges as they exist and grow
                  over time. No refunds will be issued solely because historical data does not yet span the
                  full range described in a plan or because a specific creator was not yet tracked when a
                  subscription began.
                </p>
              </Section>

              <Section title="Sponsored Content Disclosure">
                <p className="mb-4">
                  ShinyPull offers paid featured listing placements in our creator rankings pages. These placements are clearly labeled as "Sponsored" so visitors can distinguish them from organic rankings.
                </p>
                <p>
                  Sponsored listings do not influence organic ranking positions. Rankings are based solely on subscriber and follower counts collected from public platform data.
                </p>
              </Section>

              <Section title="Amazon Associates Disclosure">
                <p className="mb-4">
                  ShinyPull is a participant in the Amazon Services LLC Associates Program, an affiliate
                  advertising program designed to provide a means for sites to earn advertising fees by
                  advertising and linking to Amazon.com.
                </p>
                <p className="mb-4">
                  <strong>As an Amazon Associate I earn from qualifying purchases.</strong>
                </p>
                <p>
                  When you click on product links in our blog posts and make a purchase, we may earn a
                  commission at no additional cost to you. This helps support our platform and allows us
                  to continue providing free analytics and content to streamers and content creators.
                </p>
              </Section>

              <Section title="Contact Information">
                <p>
                  For questions about these Terms, please contact us at{' '}
                  <a href="mailto:shinypull@proton.me" className="text-indigo-600 hover:text-indigo-300">
                    shinypull@proton.me
                  </a>
                </p>
              </Section>

              <p className="text-sm text-neutral-700 mt-8">
                This Document is Effective as of March 1, 2026.
              </p>
            </div>
          </div>

          <div className="text-center text-sm text-neutral-700 mt-8">
            <p>Copyright ©2026 ShinyPull</p>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-neutral-900 mb-4">{title}</h2>
      <div className="text-neutral-700 leading-relaxed">{children}</div>
    </section>
  );
}
