"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const Button_1 = require("../ui/Button");
const api_1 = require("@/lib/api");
const api_2 = require("@/lib/api");
const PaymentModal = ({ open, onClose, bookingRequestId, onSuccess, onError, amount, serviceName, providerName: _unusedProviderName, }) => {
    const FAKE_PAYMENTS = process.env.NEXT_PUBLIC_FAKE_PAYMENTS === '1';
    const USE_PAYSTACK = process.env.NEXT_PUBLIC_USE_PAYSTACK === '1';
    const PAYSTACK_PK = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || process.env.NEXT_PUBLIC_PAYSTACK_PK;
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const [paystackUrl, setPaystackUrl] = (0, react_1.useState)(null);
    const [paystackReference, setPaystackReference] = (0, react_1.useState)(null);
    const [paystackAccessCode, setPaystackAccessCode] = (0, react_1.useState)(null);
    const [verifying, setVerifying] = (0, react_1.useState)(false);
    const [inlineBlocked, setInlineBlocked] = (0, react_1.useState)(false);
    const [showFallbackBanner, setShowFallbackBanner] = (0, react_1.useState)(false);
    const pollTimerRef = (0, react_1.useRef)(null);
    const modalRef = (0, react_1.useRef)(null);
    const autoRunRef = (0, react_1.useRef)(false);
    const handleCancel = (0, react_1.useCallback)(() => {
        if (typeof window !== 'undefined') {
            const confirmCancel = window.confirm('Cancel and return? You can restart payment anytime.');
            if (!confirmCancel) {
                return;
            }
        }
        autoRunRef.current = false;
        onClose();
    }, [onClose]);
    (0, react_1.useEffect)(() => {
        if (!open || !modalRef.current)
            return undefined;
        const modal = modalRef.current;
        const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const trap = (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === first) {
                        e.preventDefault();
                        (last || first).focus();
                    }
                }
                else if (document.activeElement === last) {
                    e.preventDefault();
                    (first || last).focus();
                }
            }
            else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        };
        document.addEventListener('keydown', trap);
        (first || modal).focus();
        return () => {
            document.removeEventListener('keydown', trap);
        };
    }, [open, handleCancel]);
    const interpretStatus = (payload, fallback, pendingMsg) => {
        var _a;
        try {
            const statusHint = (typeof (payload === null || payload === void 0 ? void 0 : payload.status) === 'string' && payload.status) ||
                (typeof ((_a = payload === null || payload === void 0 ? void 0 : payload.detail) === null || _a === void 0 ? void 0 : _a.status) === 'string' && payload.detail.status) ||
                (typeof (payload === null || payload === void 0 ? void 0 : payload.detail) === 'string' && payload.detail) ||
                '';
            const hint = statusHint.toLowerCase();
            if (hint.includes('failed') || hint.includes('declin')) {
                return 'Payment declined. Reopen Paystack to try again.';
            }
            if (hint.includes('cancel') || hint.includes('abandon')) {
                return 'Checkout cancelled before completion. Reopen Paystack when you are ready.';
            }
            if (hint.includes('pending') || hint.includes('processing')) {
                return pendingMsg;
            }
        }
        catch (_b) {
            // ignore parse errors; fall back to default messaging
        }
        return fallback;
    };
    const handlePay = (0, react_1.useCallback)(async () => {
        var _a;
        if (loading)
            return;
        setLoading(true);
        setError(null);
        setInlineBlocked(false);
        setShowFallbackBanner(false);
        setPaystackUrl(null);
        if (FAKE_PAYMENTS && !USE_PAYSTACK) {
            const fakeId = `fake_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
            const receiptUrl = (0, api_2.apiUrl)(`/api/v1/payments/${fakeId}/receipt`);
            try {
                localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
            }
            catch (_b) { }
            onSuccess({
                status: 'paid',
                amount: Number(amount),
                receiptUrl,
                paymentId: fakeId,
                mocked: true,
            });
            setLoading(false);
            return;
        }
        try {
            if (USE_PAYSTACK && PAYSTACK_PK) {
                const res = await (0, api_1.createPayment)({ booking_request_id: bookingRequestId, amount: Number(amount), full: true });
                const data = res.data;
                const reference = String((data === null || data === void 0 ? void 0 : data.reference) || (data === null || data === void 0 ? void 0 : data.payment_id) || '').trim();
                const authorizationUrl = (data === null || data === void 0 ? void 0 : data.authorization_url) || undefined;
                const accessCode = String((data === null || data === void 0 ? void 0 : data.access_code) || (data === null || data === void 0 ? void 0 : data.accessCode) || '').trim();
                if (!reference) {
                    throw new Error('Payment reference missing');
                }
                setPaystackReference(reference);
                setPaystackAccessCode(accessCode || null);
                const loadPaystack = async () => {
                    if (typeof window === 'undefined')
                        return;
                    if (window.PaystackPop)
                        return;
                    await new Promise((resolve, reject) => {
                        const s = document.createElement('script');
                        s.src = 'https://js.paystack.co/v2/inline.js';
                        s.async = true;
                        s.onload = () => resolve();
                        s.onerror = () => reject(new Error('Failed to load Paystack script'));
                        document.body.appendChild(s);
                    });
                };
                if (!accessCode) {
                    if (authorizationUrl) {
                        setPaystackUrl(authorizationUrl);
                        setPaystackAccessCode(null);
                        setShowFallbackBanner(true);
                        setLoading(false);
                        return;
                    }
                    throw new Error('Paystack access code missing');
                }
                try {
                    await loadPaystack();
                    const PaystackPop = window.PaystackPop;
                    if (PaystackPop && typeof PaystackPop === 'function') {
                        const paystack = new PaystackPop();
                        const amountKobo = Math.round(Math.max(0, Number(amount || 0)) * 100);
                        paystack.newTransaction({
                            key: PAYSTACK_PK,
                            email: 'client@booka.local',
                            amount: amountKobo,
                            currency: 'ZAR',
                            reference,
                            access_code: accessCode || undefined,
                            metadata: { booking_request_id: bookingRequestId },
                            onSuccess: async (transaction) => {
                                try {
                                    setVerifying(true);
                                    const ref = (transaction === null || transaction === void 0 ? void 0 : transaction.reference) || reference;
                                    const verifyUrl = `/api/v1/payments/paystack/verify?reference=${encodeURIComponent(ref)}`;
                                    const resp = await fetch(verifyUrl, { credentials: 'include' });
                                    if (resp.ok) {
                                        const v = await resp.json();
                                        const pid = (v === null || v === void 0 ? void 0 : v.payment_id) || ref;
                                        const receiptUrl = `/api/v1/payments/${pid}/receipt`;
                                        try {
                                            localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
                                        }
                                        catch (_a) { }
                                        onSuccess({ status: 'paid', amount: Number(amount), paymentId: pid, receiptUrl });
                                        return;
                                    }
                                    let message = 'Payment not completed yet. Return to Paystack to finish.';
                                    try {
                                        const payload = await resp.json();
                                        message = interpretStatus(payload, message, 'Payment is still pending. Leave Paystack open until it completes.');
                                    }
                                    catch (_b) {
                                        if (resp.status === 400) {
                                            message = 'Payment is still pending. Leave Paystack open until it completes.';
                                        }
                                    }
                                    setError(message);
                                    if (authorizationUrl) {
                                        setInlineBlocked(true);
                                        setShowFallbackBanner(true);
                                        setPaystackUrl(authorizationUrl);
                                    }
                                }
                                catch (_c) {
                                    setError('Verification failed. Reopen Paystack if the window closed.');
                                }
                                finally {
                                    setVerifying(false);
                                }
                            },
                            onCancel: () => {
                                setError('Payment cancelled before completion. Reopen Paystack to finish.');
                                if (authorizationUrl) {
                                    setInlineBlocked(true);
                                    setShowFallbackBanner(true);
                                    setPaystackUrl(authorizationUrl);
                                }
                            },
                        });
                        setLoading(false);
                        return;
                    }
                }
                catch (_c) {
                    setInlineBlocked(true);
                }
                if (authorizationUrl) {
                    setPaystackUrl(authorizationUrl);
                    setPaystackAccessCode(accessCode || null);
                    setShowFallbackBanner(true);
                    setLoading(false);
                    return;
                }
                setError('Unable to launch Paystack checkout. Please try again.');
                setLoading(false);
                return;
            }
            const res = await (0, api_1.createPayment)({
                booking_request_id: bookingRequestId,
                amount: Number(amount),
                full: true,
            });
            const data = res.data;
            const authUrl = data === null || data === void 0 ? void 0 : data.authorization_url;
            const reference = String((data === null || data === void 0 ? void 0 : data.reference) || (data === null || data === void 0 ? void 0 : data.payment_id) || '').trim();
            const accessCode = String((data === null || data === void 0 ? void 0 : data.access_code) || (data === null || data === void 0 ? void 0 : data.accessCode) || '').trim();
            if (authUrl && reference && PAYSTACK_PK) {
                setPaystackReference(reference);
                setPaystackAccessCode(accessCode || null);
                if (!accessCode) {
                    setPaystackUrl(authUrl);
                    setShowFallbackBanner(true);
                    setLoading(false);
                    return;
                }
                try {
                    const loadPaystack = async () => {
                        if (typeof window === 'undefined')
                            return;
                        if (window.PaystackPop)
                            return;
                        await new Promise((resolve, reject) => {
                            const s = document.createElement('script');
                            s.src = 'https://js.paystack.co/v2/inline.js';
                            s.async = true;
                            s.onload = () => resolve();
                            s.onerror = () => reject(new Error('Failed to load Paystack script'));
                            document.body.appendChild(s);
                        });
                    };
                    await loadPaystack();
                    const PaystackPop = window.PaystackPop;
                    if (PaystackPop && typeof PaystackPop === 'function') {
                        const paystack = new PaystackPop();
                        paystack.newTransaction({
                            key: PAYSTACK_PK,
                            email: 'client@booka.local',
                            amount: Math.round(Math.max(0, Number(amount || 0)) * 100),
                            currency: 'ZAR',
                            reference,
                            access_code: accessCode || undefined,
                            metadata: { booking_request_id: bookingRequestId },
                            onSuccess: async (transaction) => {
                                const ref = (transaction === null || transaction === void 0 ? void 0 : transaction.reference) || reference;
                                const verifyUrl = `/api/v1/payments/paystack/verify?reference=${encodeURIComponent(ref)}`;
                                const v = await fetch(verifyUrl, { credentials: 'include' });
                                if (v.ok) {
                                    const body = await v.json();
                                    const pid = (body === null || body === void 0 ? void 0 : body.payment_id) || ref;
                                    const rurl = `/api/v1/payments/${pid}/receipt`;
                                    try {
                                        localStorage.setItem(`receipt_url:br:${bookingRequestId}`, rurl);
                                    }
                                    catch (_a) { }
                                    onSuccess({ status: 'paid', amount: Number(amount), paymentId: pid, receiptUrl: rurl });
                                    return;
                                }
                                let message = 'Payment not completed yet. Return to Paystack to finish.';
                                try {
                                    const payload = await v.json();
                                    message = interpretStatus(payload, message, 'Payment is still pending. Leave Paystack open until it completes.');
                                }
                                catch (_b) {
                                    if (v.status === 400) {
                                        message = 'Payment is still pending. Leave Paystack open until it completes.';
                                    }
                                }
                                setError(message);
                            },
                            onCancel: () => {
                                setError('Payment cancelled before completion. Reopen Paystack to finish.');
                            },
                        });
                        setLoading(false);
                        setShowFallbackBanner(false);
                        return;
                    }
                }
                catch (_d) {
                    setInlineBlocked(true);
                    setShowFallbackBanner(true);
                }
                setPaystackUrl(authUrl);
                setPaystackAccessCode(accessCode || null);
                setLoading(false);
                return;
            }
            const paymentId = data.payment_id;
            const receiptUrl = paymentId ? (0, api_2.apiUrl)(`/api/v1/payments/${paymentId}/receipt`) : undefined;
            try {
                if (receiptUrl)
                    localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
            }
            catch (_e) { }
            onSuccess({ status: 'paid', amount: Number(amount), receiptUrl, paymentId });
        }
        catch (err) {
            const status = Number(((_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.status) || 0);
            if (FAKE_PAYMENTS && !USE_PAYSTACK) {
                console.warn('Payment API unavailable; simulating paid status (FAKE).', err);
                const hex = Math.random().toString(16).slice(2).padEnd(8, '0');
                const paymentId = `test_${Date.now().toString(16)}${hex}`;
                const receiptUrl = (0, api_2.apiUrl)(`/api/v1/payments/${paymentId}/receipt`);
                try {
                    localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
                }
                catch (_f) { }
                onSuccess({ status: 'paid', amount: Number(amount), paymentId, receiptUrl, mocked: true });
            }
            else {
                let msg = 'Payment failed. Please try again later.';
                if (status === 404)
                    msg = 'This booking is not ready for payment or was not found.';
                else if (status === 403)
                    msg = 'You are not allowed to pay for this booking.';
                else if (status === 422)
                    msg = 'Invalid payment attempt. Please refresh and try again.';
                setError(msg);
                onError(msg);
            }
        }
        finally {
            setLoading(false);
        }
    }, [FAKE_PAYMENTS, USE_PAYSTACK, PAYSTACK_PK, bookingRequestId, amount, onSuccess, onError, loading]);
    (0, react_1.useEffect)(() => {
        if (!paystackUrl || !paystackReference)
            return;
        let elapsed = 0;
        const INTERVAL = 5000;
        const MAX = 60000;
        const tick = async () => {
            try {
                const resp = await fetch((0, api_2.apiUrl)(`/api/v1/payments/paystack/verify?reference=${encodeURIComponent(paystackReference)}`), { credentials: 'include' });
                if (resp.ok) {
                    const v = await resp.json();
                    const pid = (v === null || v === void 0 ? void 0 : v.payment_id) || paystackReference;
                    const receiptUrl = (0, api_2.apiUrl)(`/api/v1/payments/${pid}/receipt`);
                    try {
                        localStorage.setItem(`receipt_url:br:${bookingRequestId}`, receiptUrl);
                    }
                    catch (_a) { }
                    onSuccess({ status: 'paid', amount: Number(amount), paymentId: pid, receiptUrl });
                    return;
                }
            }
            catch (_b) {
                // ignore network errors; continue polling until timeout
            }
            elapsed += INTERVAL;
            if (elapsed >= MAX && pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
        };
        pollTimerRef.current = window.setInterval(tick, INTERVAL);
        return () => {
            if (pollTimerRef.current) {
                clearInterval(pollTimerRef.current);
                pollTimerRef.current = null;
            }
        };
    }, [paystackUrl, paystackReference, bookingRequestId, amount, onSuccess]);
    (0, react_1.useEffect)(() => {
        if (!open) {
            autoRunRef.current = false;
            setLoading(false);
            setError(null);
            setInlineBlocked(false);
            setShowFallbackBanner(false);
            setPaystackUrl(null);
            setPaystackReference(null);
            setPaystackAccessCode(null);
            setVerifying(false);
            return;
        }
        if (autoRunRef.current)
            return;
        autoRunRef.current = true;
        handlePay().catch(() => {
            setLoading(false);
            setInlineBlocked(true);
        });
    }, [open, handlePay]);
    if (!open)
        return null;
    const showStatusBanner = Boolean(error || verifying || (loading && !paystackUrl));
    const fallbackActive = inlineBlocked && showFallbackBanner && paystackUrl;
    return (react_1.default.createElement("div", { className: "fixed inset-0 bg-black/40 flex items-center justify-center overflow-y-auto z-[999999909]" },
        react_1.default.createElement("div", { ref: modalRef, className: "bg-white rounded-lg shadow-lg w-full max-w-sm p-4 mx-2 max-h-[90vh] overflow-y-auto focus:outline-none", role: "dialog", "aria-modal": "true", "aria-labelledby": "paystack-modal-heading" },
            serviceName && (react_1.default.createElement("div", { className: "flex items-center justify-between text-sm text-gray-700 mb-3" },
                react_1.default.createElement("span", null, "Service"),
                react_1.default.createElement("span", { className: "text-gray-900" }, serviceName))),
            react_1.default.createElement("div", { className: "space-y-3" },
                showStatusBanner && (react_1.default.createElement("div", { className: "rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700" },
                    loading && !paystackUrl && react_1.default.createElement("span", null, "Opening secure checkout\u2026"),
                    !loading && verifying && react_1.default.createElement("span", null, "Verifying payment status\u2026"),
                    !loading && !verifying && error && react_1.default.createElement("span", { className: "text-red-600" }, error))),
                fallbackActive && (react_1.default.createElement("div", { className: "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" }, "Your browser blocked the inline checkout. Use the secure window below or open it in a new tab.")),
                paystackUrl && (react_1.default.createElement(react_1.default.Fragment, null,
                    react_1.default.createElement("div", { className: "rounded-md border overflow-hidden" },
                        react_1.default.createElement("iframe", { title: "Paystack Checkout", src: paystackUrl, className: "w-full h-[560px] border-0" })),
                    fallbackActive && (react_1.default.createElement("a", { href: paystackUrl, target: "_blank", rel: "noopener noreferrer", className: "inline-flex items-center justify-center rounded-md font-semibold min-h-10 px-3 py-2 text-sm bg-brand text-white hover:bg-brand-dark/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-dark" }, "Open checkout in a new tab"))))),
            fallbackActive && (react_1.default.createElement("div", { className: "mt-6 flex justify-end" },
                react_1.default.createElement(Button_1.default, { type: "button", onClick: handlePay, isLoading: loading }, "Reopen Paystack"))))));
};
exports.default = PaymentModal;
