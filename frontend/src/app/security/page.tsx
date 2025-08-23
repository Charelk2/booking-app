'use client';

import Link from 'next/link';
import Button from '@/components/ui/Button';
import { webauthnGetRegistrationOptions, webauthnVerifyRegistration } from '@/lib/api';
import { useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';

export default function SecurityPage() {
  const [passkeyMsg, setPasskeyMsg] = useState<string>('');
  const createPasskey = async () => {
    setPasskeyMsg('');
    try {
      if (!('PublicKeyCredential' in window)) {
        setPasskeyMsg('Passkeys not supported on this device.');
        return;
      }
      const toBase64Url = (buf: ArrayBuffer) => {
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      };
      const fromBase64Url = (b64url: string): Uint8Array => {
        let s = b64url.replace(/-/g, '+').replace(/_/g, '/');
        const pad = s.length % 4;
        if (pad) s += '='.repeat(4 - pad);
        const bin = atob(s);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        return bytes;
      };
      const { data: opts } = await webauthnGetRegistrationOptions();
      const publicKey: PublicKeyCredentialCreationOptions = {
        challenge: fromBase64Url(opts.challenge as string),
        rp: opts.rp,
        user: {
          ...opts.user,
          id: fromBase64Url(opts.user.id as string),
        },
        pubKeyCredParams: opts.pubKeyCredParams,
        authenticatorSelection: opts.authenticatorSelection,
        attestation: opts.attestation,
      };
      const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
      const payload = {
        id: cred.id,
        type: cred.type,
        rawId: toBase64Url(cred.rawId as ArrayBuffer),
        response: {
          clientDataJSON: toBase64Url((cred.response as AuthenticatorAttestationResponse).clientDataJSON),
          attestationObject: toBase64Url((cred.response as AuthenticatorAttestationResponse).attestationObject),
        },
      };
      await webauthnVerifyRegistration(payload);
      setPasskeyMsg('Passkey registered.');
    } catch (e: any) {
      const m = e?.response?.data?.detail || e?.message || 'Passkey setup failed.';
      setPasskeyMsg(typeof m === 'string' ? m : 'Passkey setup failed.');
    }
  };
  return (
    <MainLayout>
      <div className="mx-auto max-w-lg py-10">
        <h1 className="mb-4 text-2xl font-bold">Account Security</h1>
        <ul className="space-y-2">
          <li>
            <Link href="/security/enable" className="text-brand-dark underline">
              Enable two-factor authentication
            </Link>
          </li>
          <li>
            <Link href="/security/disable" className="text-brand-dark underline">
              Disable two-factor authentication
            </Link>
          </li>
        </ul>
        <div className="mt-8 space-y-2">
          <h2 className="text-lg font-semibold">Passkeys (beta)</h2>
          <Button type="button" onClick={createPasskey} className="bg-gray-700 hover:bg-gray-800">
            Create a passkey
          </Button>
          {passkeyMsg && <p className="text-sm text-gray-700">{passkeyMsg}</p>}
        </div>
      </div>
    </MainLayout>
  );
}
