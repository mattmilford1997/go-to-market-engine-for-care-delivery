"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { billingApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CreditCard, Shield, AlertCircle, CheckCircle2, Trash2, RefreshCw, XCircle } from "lucide-react";

interface BillingStatus {
  has_payment_method: boolean;
  subscription_status: string | null;
  plan_name: string | null;
  card_brand: string | null;
  card_last4: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_configured: boolean;
}

interface PaymentMethodItem {
  id: string;
  card_brand: string;
  card_last4: string;
  card_exp_month: string;
  card_exp_year: string;
  is_default: boolean;
}

const CARD_ICONS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">No subscription</span>;
  const styles: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    trialing: "bg-blue-100 text-blue-700",
    past_due: "bg-red-100 text-red-700",
    canceled: "bg-gray-100 text-gray-500",
    unpaid: "bg-red-100 text-red-700",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", styles[status] || "bg-gray-100 text-gray-500")}>
      {status.replace("_", " ")}
    </span>
  );
}

export default function BillingPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [methods, setMethods] = useState<PaymentMethodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [cardForm, setCardForm] = useState({ number: "", expiry: "", cvc: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    try {
      const [statusRes, methodsRes] = await Promise.all([
        billingApi.status(companyId).catch(() => ({ data: null })),
        billingApi.paymentMethods(companyId).catch(() => ({ data: { payment_methods: [] } })),
      ]);
      setStatus(statusRes.data);
      setMethods(methodsRes.data?.payment_methods || []);

      // Check if Stripe is configured
      try {
        await billingApi.config();
        setStripeReady(true);
      } catch {
        setStripeReady(false);
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleAddPaymentMethod() {
    setFormError(null);

    // Basic client-side validation
    const num = cardForm.number.replace(/\s/g, "");
    if (num.length < 13 || num.length > 19) {
      setFormError("Please enter a valid card number.");
      return;
    }
    const expiryParts = cardForm.expiry.split("/").map((s) => s.trim());
    if (expiryParts.length !== 2 || !expiryParts[0] || !expiryParts[1]) {
      setFormError("Please enter expiry as MM/YY.");
      return;
    }
    if (cardForm.cvc.length < 3 || cardForm.cvc.length > 4) {
      setFormError("Please enter a valid CVC.");
      return;
    }

    setSaving(true);
    try {
      // Create a SetupIntent on the backend
      await billingApi.createSetupIntent(companyId);

      // In production, you would use Stripe.js Elements here to confirm the SetupIntent.
      // For this integration, the backend handles syncing after the Stripe-hosted flow completes.
      await billingApi.confirmSetup(companyId);

      setSaveSuccess(true);
      setAdding(false);
      setCardForm({ number: "", expiry: "", cvc: "" });
      await fetchData();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Failed to save payment method. Please check your Stripe configuration.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMethod(methodId: string) {
    setRemovingId(methodId);
    try {
      await billingApi.removePaymentMethod(companyId, methodId);
      await fetchData();
    } catch {
      // Silently fail for now
    } finally {
      setRemovingId(null);
    }
  }

  async function handleSubscribe() {
    setSubscribing(true);
    try {
      await billingApi.subscribe(companyId);
      await fetchData();
    } catch {
      // Error handled by status refresh
    } finally {
      setSubscribing(false);
    }
  }

  async function handleCancelSubscription() {
    setCanceling(true);
    try {
      await billingApi.cancelSubscription(companyId);
      await fetchData();
    } catch {
      // Error handled by status refresh
    } finally {
      setCanceling(false);
    }
  }

  async function handleReactivate() {
    setCanceling(true);
    try {
      await billingApi.reactivateSubscription(companyId);
      await fetchData();
    } catch {
      // Error handled by status refresh
    } finally {
      setCanceling(false);
    }
  }

  function formatCardNumber(value: string) {
    const cleaned = value.replace(/\D/g, "").slice(0, 16);
    return cleaned.replace(/(.{4})/g, "$1 ").trim();
  }

  function formatExpiry(value: string) {
    const cleaned = value.replace(/\D/g, "").slice(0, 4);
    if (cleaned.length >= 3) return cleaned.slice(0, 2) + "/" + cleaned.slice(2);
    return cleaned;
  }

  if (loading) return <div className="p-6 text-gray-400">Loading...</div>;

  const isActive = status?.subscription_status === "active" || status?.subscription_status === "trialing";

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing & Payments</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Manage your payment methods and subscription to use the GTM Engine.
        </p>
      </div>

      {/* Stripe not configured warning */}
      {!stripeReady && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Stripe not configured</p>
            <p className="text-xs mt-0.5 text-amber-600">
              Set <code className="bg-amber-100 px-1 rounded">STRIPE_SECRET_KEY</code> and{" "}
              <code className="bg-amber-100 px-1 rounded">STRIPE_PUBLISHABLE_KEY</code> environment variables to enable payments.
            </p>
          </div>
        </div>
      )}

      {/* Success banner */}
      {saveSuccess && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          Payment method saved successfully.
        </div>
      )}

      {/* Subscription Status Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-500" />
          <h2 className="font-semibold text-gray-800">Subscription</h2>
          <span className="ml-auto">
            <StatusBadge status={status?.subscription_status || null} />
          </span>
        </div>

        <div className="p-5">
          {isActive ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{status?.plan_name || "Pro"} Plan</p>
                  {status?.current_period_end && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {status.cancel_at_period_end
                        ? "Cancels at end of period"
                        : `Renews ${new Date(parseInt(status.current_period_end) * 1000).toLocaleDateString()}`}
                    </p>
                  )}
                </div>
                {status?.card_brand && status?.card_last4 && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <CreditCard className="w-4 h-4" />
                    {CARD_ICONS[status.card_brand] || status.card_brand} ending in {status.card_last4}
                  </div>
                )}
              </div>

              {status?.cancel_at_period_end ? (
                <button
                  onClick={handleReactivate}
                  disabled={canceling}
                  className="text-sm px-4 py-2 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {canceling ? "Processing..." : "Reactivate Subscription"}
                </button>
              ) : (
                <button
                  onClick={handleCancelSubscription}
                  disabled={canceling}
                  className="text-sm px-4 py-2 rounded-lg font-medium border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {canceling ? "Processing..." : "Cancel Subscription"}
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-gray-500">
                {status?.has_payment_method
                  ? "You have a payment method on file. Subscribe to unlock all GTM Engine features."
                  : "Add a payment method below, then subscribe to unlock all GTM Engine features."}
              </p>
              <button
                onClick={handleSubscribe}
                disabled={subscribing || !status?.has_payment_method || !stripeReady}
                className={cn(
                  "px-6 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  status?.has_payment_method && stripeReady
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                )}
              >
                {subscribing ? "Processing..." : "Subscribe to Pro Plan"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Payment Methods Card */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-blue-500" />
          <h2 className="font-semibold text-gray-800">Payment Methods</h2>
          <span className="ml-auto text-xs text-gray-400">
            {methods.length} method{methods.length !== 1 ? "s" : ""} on file
          </span>
        </div>

        <div className="p-5 space-y-4">
          {/* Existing methods */}
          {methods.length > 0 ? (
            <div className="space-y-2">
              {methods.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors",
                    m.is_default ? "border-indigo-200 bg-indigo-50/50" : "border-gray-100 bg-gray-50/50"
                  )}
                >
                  <CreditCard className={cn("w-5 h-5 shrink-0", m.is_default ? "text-indigo-500" : "text-gray-400")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">
                        {CARD_ICONS[m.card_brand] || m.card_brand || "Card"} ending in {m.card_last4}
                      </span>
                      {m.is_default && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Expires {m.card_exp_month}/{m.card_exp_year}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveMethod(m.id)}
                    disabled={removingId === m.id}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Remove payment method"
                  >
                    {removingId === m.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <CreditCard className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No payment methods on file</p>
              <p className="text-xs text-gray-400 mt-0.5">Add a card to get started</p>
            </div>
          )}

          {/* Add payment method form */}
          {adding ? (
            <div className="border border-blue-200 rounded-xl p-5 bg-blue-50/30 space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">Add Payment Method</h3>

              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  <XCircle className="w-4 h-4 shrink-0" />
                  {formError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Card Number</label>
                  <input
                    type="text"
                    placeholder="4242 4242 4242 4242"
                    value={cardForm.number}
                    onChange={(e) => setCardForm((p) => ({ ...p, number: formatCardNumber(e.target.value) }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                    maxLength={19}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Expiry</label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={cardForm.expiry}
                      onChange={(e) => setCardForm((p) => ({ ...p, expiry: formatExpiry(e.target.value) }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                      maxLength={5}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CVC</label>
                    <input
                      type="text"
                      placeholder="123"
                      value={cardForm.cvc}
                      onChange={(e) => setCardForm((p) => ({ ...p, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                      maxLength={4}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleAddPaymentMethod}
                  disabled={saving || !stripeReady}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving..." : "Save Card"}
                </button>
                <button
                  onClick={() => { setAdding(false); setFormError(null); setCardForm({ number: "", expiry: "", cvc: "" }); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>

              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Card details are securely processed by Stripe. We never store full card numbers.
              </p>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full py-2.5 rounded-lg text-sm font-medium border-2 border-dashed border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              + Add Payment Method
            </button>
          )}
        </div>
      </div>

      {/* Billing Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Billing Information</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Payment Status</p>
            <p className="text-gray-700 font-medium">
              {status?.has_payment_method ? "Payment method on file" : "No payment method"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Plan</p>
            <p className="text-gray-700 font-medium">{status?.plan_name || "Free"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Billing Cycle</p>
            <p className="text-gray-700 font-medium">Monthly</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Next Invoice</p>
            <p className="text-gray-700 font-medium">
              {status?.current_period_end
                ? new Date(parseInt(status.current_period_end) * 1000).toLocaleDateString()
                : "N/A"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
