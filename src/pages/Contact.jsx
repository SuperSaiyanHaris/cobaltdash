import { useState } from 'react';
import SEO from '../components/SEO';
import { Mail, MessageSquare, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { analytics } from '../lib/analytics';

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      setStatus('success');
      setFormData({ name: '', email: '', message: '' });
      analytics.contactSubmit(true);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error.message || 'Something went wrong. Please try again.');
      analytics.contactSubmit(false);
    }
  };

  return (
    <>
      <SEO
        title="Contact Us"
        description="Get in touch with the ShinyPull team. We're here to help with questions, feedback, and support."
      />

      <div className="min-h-screen bg-[#fafaf9]">
        {/* Header — white block, hairline rule, typographic */}
        <div className="bg-white border-b border-neutral-200/80">
          <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14 text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-400 mb-3">Contact</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900">Get in touch</h1>
            <p className="mt-2 text-sm sm:text-base text-neutral-500">
              We'd love to hear from you
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-8">
                <p className="text-neutral-700 mb-8">
                  Have a question, feedback, or need support? We'd love to hear from you.
                </p>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Mail className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Email</h3>
                      <a href="mailto:shinypull@proton.me" className="text-indigo-600 hover:text-indigo-700 transition-colors">
                        shinypull@proton.me
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-1">Response Time</h3>
                      <p className="text-neutral-700">We typically respond within 24-48 hours</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-neutral-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-8">
              {status === 'success' ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-neutral-900 mb-2">Message sent</h3>
                  <p className="text-neutral-500 text-sm">We'll get back to you soon.</p>
                  <button
                    onClick={() => setStatus('idle')}
                    className="mt-4 text-indigo-600 hover:text-indigo-700 transition-colors font-medium text-sm"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {status === 'error' && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <span className="text-sm">{errorMessage}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      disabled={status === 'loading'}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-300 rounded-xl text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      disabled={status === 'loading'}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-300 rounded-xl text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Message</label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      disabled={status === 'loading'}
                      rows={5}
                      className="w-full px-4 py-3 bg-neutral-50 border border-neutral-300 rounded-xl text-neutral-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:border-transparent resize-none disabled:opacity-50"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {status === 'loading' ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Message'
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
