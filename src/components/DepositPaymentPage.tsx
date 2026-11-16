import { useEffect, useMemo, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import {
  fetchDepositConfig,
  submitPlayerDepositRequest,
  type DepositPaymentConfig,
} from '../api/adminClient';
import { createLiveDepositLink } from '../api/liveBackendClient';
import { readStoredAuthSession } from '../api/authClient';
import {
  buildUpiPaymentUri,
  DEFAULT_ADMIN_SETTINGS,
  validateUtrReference,
  type AdminDepositRecord,
  type UpiAppScheme,
} from '../shared/admin';
import { PageTitleHeading } from './PageTitleHeading';

interface DepositPaymentPageProps {
  amount: number;
  playerName: string;
  onSubmitted: (deposits: AdminDepositRecord[]) => void;
  onBackToDeposit: () => void;
  onBackToWallet: () => void;
}

interface UpiAppButtonConfig {
  id: string;
  label: string;
  methodName: string;
  scheme: UpiAppScheme;
}

const UPI_APPS: UpiAppButtonConfig[] = [
  { id: 'phonepe', label: 'PhonePe', methodName: 'PhonePe UPI', scheme: 'phonepe' },
  { id: 'gpay', label: 'Google Pay', methodName: 'GPay UPI', scheme: 'gpay' },
  { id: 'paytm', label: 'Paytm', methodName: 'Paytm UPI', scheme: 'paytm' },
  { id: 'bhim', label: 'BHIM UPI', methodName: 'BHIM UPI', scheme: 'upi' },
];

function UpiAppLogo({ appId }: { appId: string }) {
  if (appId === 'phonepe') {
    return (
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#5F259F" />
        <text
          x="16"
          y="21.5"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="16"
          fontWeight="800"
          fontFamily="system-ui, sans-serif"
        >
          पे
        </text>
      </svg>
    );
  }
  if (appId === 'gpay') {
    return (
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#FFFFFF" stroke="#E2E8F0" />
        <path
          d="M16.2 14.6v2.9h4.1c-.2 1-.9 1.9-1.8 2.5v2h2.9c1.7-1.5 2.6-3.8 2.6-6.3 0-.6-.1-1.2-.2-1.7h-7.6z"
          fill="#4285F4"
        />
        <path
          d="M10.9 18.4c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4v-2.1H8.2C7.6 12.8 7.2 14.3 7.2 16s.4 3.2 1 4.5l2.7-2.1z"
          fill="#FBBC05"
        />
        <path
          d="M16 11.1c1.2 0 2.3.4 3.1 1.2l2.3-2.3C19.9 8.6 18.1 8 16 8c-3.5 0-6.5 2-7.8 5l2.7 2.1c.6-2 2.6-4 5.1-4z"
          fill="#EA4335"
        />
        <path
          d="M16 24c2.1 0 3.9-.7 5.2-1.9l-2.9-2c-.7.5-1.5.8-2.3.8-2.5 0-4.5-1.7-5.1-4l-2.7 2.1C9.5 22 12.5 24 16 24z"
          fill="#34A853"
        />
      </svg>
    );
  }
  if (appId === 'paytm') {
    return (
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#FFFFFF" stroke="#E2E8F0" />
        <text
          x="10.5"
          y="20"
          textAnchor="middle"
          fill="#002970"
          fontSize="10.5"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          pay
        </text>
        <text
          x="22.8"
          y="20"
          textAnchor="middle"
          fill="#00BAF2"
          fontSize="10.5"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          tm
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#0D7A5F" />
      <path d="M11.5 9l6.5 7-6.5 7V9z" fill="#FF9933" />
      <path d="M16.5 9l6.5 7-6.5 7V9z" fill="#FFFFFF" />
    </svg>
  );
}

export function DepositPaymentPage({
  amount,
  playerName,
  onSubmitted,
  onBackToDeposit,
  onBackToWallet,
}: DepositPaymentPageProps) {
  const safeAmount = Math.max(10, Math.round(Number(amount) || 0));
  const isAndroidDevice =
    typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  const [config, setConfig] = useState<DepositPaymentConfig>({
    upiId: DEFAULT_ADMIN_SETTINGS.depositUpiId || 'ludoleague@ybl',
    merchantName: DEFAULT_ADMIN_SETTINGS.depositMerchantName || 'Ludo league.online',
    minDeposit: DEFAULT_ADMIN_SETTINGS.minDeposit,
    maxDeposit: DEFAULT_ADMIN_SETTINGS.maxDeposit,
  });
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string>('UPI Intent');
  const [intentNotice, setIntentNotice] = useState<string | null>(null);
  const [utrInput, setUtrInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<AdminDepositRecord | null>(null);

  const [txnRef] = useState(
    () => `LLD${Date.now().toString().slice(-8)}`
  );

  const [liveGatewayUrl, setLiveGatewayUrl] = useState<string | null>(null);
  const [gatewayLoading, setGatewayLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    fetchDepositConfig()
      .then((cfg) => {
        if (active) setConfig(cfg);
      })
      .catch(() => {
        // fallback defaults already set
      });

    const session = readStoredAuthSession();
    if (session?.token) {
      setGatewayLoading(true);
      createLiveDepositLink(safeAmount, session.token)
        .then((res) => {
          if (active && res?.url) {
            setLiveGatewayUrl(res.url);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setGatewayLoading(false);
        });
    }

    const onPaymentSuccess = () => {
      if (!active) return;
      const rec: AdminDepositRecord = {
        id: `DEP_${Date.now()}`,
        playerId: playerName,
        playerName,
        amount: safeAmount,
        method: 'Live UPI Gateway',
        reference: 'AUTO_CREDITED',
        status: 'approved',
        createdAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
      };
      setSubmittedRecord(rec);
      onSubmitted([rec]);
    };

    window.addEventListener('ludobridge.paymentSuccess', onPaymentSuccess);

    return () => {
      active = false;
      window.removeEventListener('ludobridge.paymentSuccess', onPaymentSuccess);
    };
  }, [safeAmount, playerName, onSubmitted]);

  const activeQrUri = useMemo(() => {
    if (liveGatewayUrl && (liveGatewayUrl.startsWith('upi://') || liveGatewayUrl.startsWith('https://'))) {
      return liveGatewayUrl;
    }
    return buildUpiPaymentUri({
      upiId: config.upiId,
      merchantName: config.merchantName,
      amount: safeAmount,
      note: `Wallet Deposit ${safeAmount} INR`,
      scheme: 'upi',
    });
  }, [config.merchantName, config.upiId, liveGatewayUrl, safeAmount]);

  const genericUpiUri = activeQrUri;

  const appLinks = useMemo(
    () =>
      UPI_APPS.map((app) => ({
        ...app,
        href: (liveGatewayUrl && liveGatewayUrl.startsWith('upi://'))
          ? liveGatewayUrl
          : buildUpiPaymentUri({
              upiId: config.upiId,
              merchantName: config.merchantName,
              amount: safeAmount,
              note: `Wallet Deposit ${safeAmount} INR`,
              scheme: app.scheme,
              androidIntent: isAndroidDevice,
            }),
      })),
    [config.merchantName, config.upiId, isAndroidDevice, liveGatewayUrl, safeAmount]
  );

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(activeQrUri, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#16181D',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [activeQrUri]);

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(config.upiId);
      setCopiedUpi(true);
      window.setTimeout(() => setCopiedUpi(false), 2000);
    } catch {
      setCopiedUpi(false);
    }
  };

  const handleSubmitDeposit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const utrCheck = validateUtrReference(utrInput);
    if (!utrCheck.valid) {
      setErrorMsg(utrCheck.error || 'कृपया सही UTR नंबर दर्ज करें।');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitPlayerDepositRequest({
        playerName,
        amount: safeAmount,
        method: selectedMethod,
        reference: utrCheck.value,
      });
      setSubmittedRecord(res.deposit);
      onSubmitted(res.deposits);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Deposit request सबमिट नहीं हो सकी। कृपया पुनः प्रयास करें।'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="w-full px-4 py-3 sm:px-8 sm:py-6 space-y-4"
      data-testid="deposit-payment-page"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBackToDeposit}
            data-testid="back-to-deposit-btn"
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-2 -ml-2 text-xs font-semibold text-[#0D7A5F] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Deposit Amount</span>
          </button>
          <PageTitleHeading title="UPI QR & Deposit Payment" />
        </div>
      </div>

      {submittedRecord ? (
        <section
          data-testid="deposit-submitted-card"
          className="rounded-2xl bg-white p-6 sm:p-8 shadow-surface-card space-y-5 max-w-2xl"
        >
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E6F4F0] text-[#0D7A5F] shrink-0">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-[#16181D]">
                Deposit Request Submitted!
              </h2>
              <p className="text-sm text-[#454A54]">
                आपकी ₹{submittedRecord.amount.toLocaleString('en-IN')} की Deposit Request एडमिन को भेज दी गई है। एडमिन द्वारा Approve करने के बाद राशि आपके वॉलेट में जुड़ जाएगी।
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-b border-[#16181D]/8 py-4 text-xs">
            <div>
              <dt className="text-[#5A606D]">Request ID</dt>
              <dd className="mt-1 font-mono font-bold text-[#16181D]">
                {submittedRecord.id}
              </dd>
            </div>
            <div>
              <dt className="text-[#5A606D]">Amount</dt>
              <dd className="mt-1 font-display text-sm font-bold text-[#0D7A5F] tabular-nums">
                ₹{submittedRecord.amount.toLocaleString('en-IN')}
              </dd>
            </div>
            <div>
              <dt className="text-[#5A606D]">UTR Reference</dt>
              <dd className="mt-1 font-mono font-bold text-[#16181D]">
                {submittedRecord.reference}
              </dd>
            </div>
            <div>
              <dt className="text-[#5A606D]">Status</dt>
              <dd className="mt-1 inline-flex items-center gap-1 font-bold text-[#D97706]">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Pending Approval</span>
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onBackToDeposit}
              data-testid="view-deposit-status-btn"
              className="min-h-[44px] inline-flex items-center justify-center rounded-full bg-[#0D7A5F] px-6 py-2.5 text-xs font-bold text-white shadow-emerald-btn hover:bg-[#064E3B] whitespace-nowrap"
            >
              View Deposit Status
            </button>
            <button
              type="button"
              onClick={onBackToWallet}
              className="min-h-[44px] inline-flex items-center justify-center rounded-full bg-[#16181D] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#2A2D35] whitespace-nowrap"
            >
              Back to Wallet
            </button>
          </div>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-12 items-start">
          {/* Primary Card: Exact Amount QR Code + UTR Field & Submit Together (No Scroll) */}
          <section
            aria-label="Scan UPI QR Code and Submit UTR"
            data-testid="qr-utr-card"
            className="lg:col-span-6 flex flex-col rounded-2xl bg-gradient-to-br from-[#0D7458] via-[#064E3B] to-[#032D22] p-4 sm:p-5 text-white shadow-emerald-card space-y-3.5"
          >
            {/* Header Row: Exact Amount + Copy UPI ID */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium text-[#A7F3D0]">
                  Exact Deposit Amount
                </p>
                <p
                  data-testid="deposit-qr-amount"
                  className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white tabular-nums"
                >
                  ₹{safeAmount.toLocaleString('en-IN')}
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/25 px-2.5 py-1.5 max-w-[60%]">
                <div className="min-w-0">
                  <p className="text-[9px] font-medium text-[#A7F3D0]">
                    UPI ID ({txnRef})
                  </p>
                  <p
                    data-testid="deposit-upi-id"
                    className="truncate font-mono text-[11px] font-bold text-white"
                  >
                    {config.upiId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUpi}
                  className="min-h-[32px] inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#064E3B] hover:bg-[#FAF9F5] shrink-0 whitespace-nowrap"
                >
                  {copiedUpi ? (
                    <>
                      <Check className="h-3 w-3" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" aria-hidden="true" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Compact QR Box */}
            <div className="flex items-center gap-3.5 rounded-2xl bg-white p-3 sm:p-4 text-[#16181D] shadow-md">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`UPI QR Code for ₹${safeAmount}`}
                  data-testid="deposit-qr-image"
                  data-upi-uri={genericUpiUri}
                  className="h-28 w-28 sm:h-36 sm:w-36 shrink-0 rounded-xl object-contain border border-[#16181D]/10"
                />
              ) : (
                <div className="flex h-28 w-28 sm:h-36 sm:w-36 shrink-0 items-center justify-center rounded-xl bg-[#F8F7F4] text-[11px] font-medium text-[#5A606D] text-center p-2">
                  Generating QR...
                </div>
              )}

              <div className="min-w-0 space-y-1.5">
                <p className="text-xs sm:text-sm font-bold text-[#16181D] leading-snug">
                  Scan &amp; Pay ₹{safeAmount.toLocaleString('en-IN')}
                </p>
                <p className="text-[11px] font-semibold text-[#0D7A5F] truncate">
                  {config.merchantName}
                </p>
                <p className="text-[11px] text-[#5A606D] leading-snug">
                  PhonePe, Google Pay, Paytm या किसी भी UPI ऐप से यह QR कोड स्कैन करके पेमेंट करें।
                </p>
              </div>
            </div>

            {/* UTR Form Inside the QR Field (Zero Scroll) */}
            <form
              onSubmit={handleSubmitDeposit}
              noValidate
              className="rounded-2xl bg-white/95 p-3.5 sm:p-4 text-[#16181D] space-y-2.5 shadow-sm"
            >
              <div className="space-y-0.5">
                <p
                  data-testid="deposit-hindi-instruction"
                  className="text-xs font-bold leading-snug text-[#9A3412]"
                >
                  पेमेंट सफल होने के बाद नीचे 12 अंकों का UTR नंबर दर्ज करें और Submit पर क्लिक करें:
                </p>
                <p className="text-[11px] text-[#5A606D]">
                  एडमिन द्वारा Approve करते ही ₹{safeAmount.toLocaleString('en-IN')} वॉलेट में जुड़ जाएंगे।
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="deposit-utr-input"
                    className="block text-xs font-bold text-[#16181D]"
                  >
                    UTR / Reference Number
                  </label>
                  <span className="text-[10px] font-semibold text-[#0D7A5F]">
                    {selectedMethod}
                  </span>
                </div>

                <input
                  id="deposit-utr-input"
                  data-testid="deposit-utr-input"
                  type="text"
                  inputMode="text"
                  maxLength={24}
                  value={utrInput}
                  onChange={(e) => {
                    setUtrInput(e.target.value.toUpperCase());
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="12 अंकों का UTR नंबर डालें (उदा. 431892014412)"
                  className="w-full min-h-[44px] rounded-xl border border-[#16181D]/20 bg-[#F8F7F4] px-3.5 py-2 font-mono text-sm font-bold text-[#16181D] placeholder:font-sans placeholder:font-normal placeholder:text-[#8C8F96] focus:border-[#0D7A5F] focus:bg-white focus:outline-none"
                />
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  data-testid="deposit-utr-error"
                  className="rounded-xl bg-[#991B1B] px-3 py-2 text-xs font-medium text-white"
                >
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                data-testid="submit-deposit-request-btn"
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#16181D] px-5 py-2.5 text-sm font-bold text-white shadow-pill-btn transition-colors hover:bg-[#2A2D35] disabled:opacity-60 whitespace-nowrap"
              >
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {submitting
                    ? 'Submitting Request...'
                    : `Submit Deposit Request (₹${safeAmount.toLocaleString('en-IN')})`}
                </span>
              </button>
            </form>
          </section>

          {/* Secondary Card: Pay via UPI & Popular UPI App Intent Buttons */}
          <section
            aria-label="Pay via UPI App"
            className="lg:col-span-6 flex flex-col justify-between rounded-2xl bg-white p-4 sm:p-6 shadow-surface-card space-y-4"
          >
            <div className="space-y-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-lg sm:text-xl font-bold text-[#16181D]">
                  Pay via UPI App
                </h2>
                <span className="text-xs font-semibold text-[#0D7A5F] tabular-nums">
                  ₹{safeAmount.toLocaleString('en-IN')}
                </span>
              </div>

              <a
                href={genericUpiUri}
                data-testid="pay-via-upi-btn"
                onClick={() => {
                  setSelectedMethod('UPI Intent');
                  setIntentNotice(
                    `UPI पेमेंट लिंक (₹${safeAmount.toLocaleString('en-IN')}) ओपन किया गया है। पेमेंट पूरा करके बाईं ओर दिए बॉक्स में UTR नंबर डालें।`
                  );
                }}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#0D7A5F] px-5 py-3 text-sm font-bold text-white shadow-emerald-btn transition-colors hover:bg-[#064E3B] whitespace-nowrap"
              >
                <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Pay ₹{safeAmount.toLocaleString('en-IN')} via UPI</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </a>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                {appLinks.map((app) => {
                  const active = selectedMethod === app.methodName;
                  return (
                    <a
                      key={app.id}
                      href={app.href}
                      data-testid={`upi-app-btn-${app.id}`}
                      onClick={() => {
                        setSelectedMethod(app.methodName);
                        setIntentNotice(
                          app.id === 'phonepe'
                            ? `PhonePe UPI रिक्वेस्ट (₹${safeAmount.toLocaleString('en-IN')}) ओपन की गई है। पेमेंट के बाद QR कार्ड में UTR नंबर दर्ज करें।`
                            : `${app.label} पेमेंट रिक्वेस्ट (₹${safeAmount.toLocaleString('en-IN')}) तैयार है। पेमेंट के बाद QR कार्ड में UTR नंबर दर्ज करें।`
                        );
                      }}
                      className={`flex min-h-[54px] items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all ${
                        active
                          ? 'border-[#0D7A5F] bg-[#E6F4F0]/60 shadow-xs'
                          : 'border-[#16181D]/10 bg-[#F8F7F4] hover:border-[#0D7A5F]/50 hover:bg-white'
                      }`}
                    >
                      <UpiAppLogo appId={app.id} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[#16181D]">
                          {app.label}
                        </p>
                        <p className="text-[10px] font-medium text-[#5A606D] whitespace-nowrap">
                          Tap to Pay
                        </p>
                      </div>
                    </a>
                  );
                })}
              </div>

              {intentNotice && (
                <p
                  role="status"
                  data-testid="upi-intent-notice"
                  className="rounded-xl bg-[#E6F4F0] px-3.5 py-2.5 text-xs font-medium text-[#064E3B]"
                >
                  {intentNotice}
                </p>
              )}
            </div>

            <div className="rounded-xl bg-[#F8F7F4] p-3.5 text-xs text-[#454A54] space-y-1.5 border border-[#16181D]/8">
              <p className="font-bold text-[#16181D]">
                UPI पेमेंट टिप (PhonePe / GPay / Paytm)
              </p>
              <p className="leading-relaxed">
                यदि किसी ऐप में डायरेक्ट लिंक ओपन न हो, तो <strong>Pay via UPI</strong> बटन दबाएँ या QR कोड स्कैन / UPI ID (<strong>{config.upiId}</strong>) कॉपी करके पेमेंट करें।
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
