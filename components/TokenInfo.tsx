'use client';

import { useEffect, useState } from 'react';

interface TokenData {
  appId: string | null;
  appName: string | null;
  type: string | null;
  userId: string | null;
  isValid: boolean;
  expiresAt: string | null;
  neverExpires: boolean;
  scopes: string[];
  granularScopes: { scope: string; target_ids?: string[] }[];
  adAccountId: string | null;
  adAccounts: { id: string; name: string; account_status: number }[];
}

const SCOPE_LABELS: Record<string, string> = {
  ads_management: 'Gestion des publicités',
  ads_read: 'Lecture des publicités',
  business_management: 'Gestion Business Manager',
  read_insights: 'Lecture des insights',
  pages_read_engagement: 'Lecture engagement Pages',
  pages_manage_ads: 'Gestion des annonces Pages',
  catalog_management: 'Gestion du catalogue',
  email: 'Adresse e-mail',
  public_profile: 'Profil public',
};

function ScopeBadge({ scope }: { scope: string }) {
  const label = SCOPE_LABELS[scope] ?? scope;
  const isAdsRelated = ['ads_management', 'ads_read', 'read_insights', 'business_management', 'pages_manage_ads'].includes(scope);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
        isAdsRelated
          ? 'bg-blue-100 text-blue-800'
          : 'bg-gray-100 text-gray-700'
      }`}
    >
      {label}
    </span>
  );
}

function AccountStatusBadge({ status }: { status: number }) {
  if (status === 1) return <span className="text-xs font-semibold text-green-600">Actif</span>;
  if (status === 2) return <span className="text-xs font-semibold text-red-600">Désactivé</span>;
  if (status === 3) return <span className="text-xs font-semibold text-orange-500">Suspendu</span>;
  return <span className="text-xs text-gray-500">Statut {status}</span>;
}

export default function TokenInfo() {
  const [data, setData] = useState<TokenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/token-info')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => setError('Impossible de contacter le serveur'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Vérification du token…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="text-sm font-semibold text-red-700">Erreur</p>
        <p className="text-sm text-red-600 mt-1">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const expiryDate = data.expiresAt ? new Date(data.expiresAt) : null;
  const isExpiringSoon = expiryDate && !data.neverExpires
    ? expiryDate.getTime() - Date.now() < 7 * 24 * 3600 * 1000
    : false;

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div
        className={`flex items-center gap-3 rounded-xl px-5 py-4 ${
          data.isValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}
      >
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${data.isValid ? 'bg-green-500' : 'bg-red-500'}`} />
        <div>
          <p className={`text-sm font-semibold ${data.isValid ? 'text-green-800' : 'text-red-800'}`}>
            Token {data.isValid ? 'valide' : 'invalide ou expiré'}
          </p>
          {data.appName && (
            <p className="text-xs text-gray-500 mt-0.5">
              Application : <span className="font-medium text-gray-700">{data.appName}</span>
              {data.appId && <span className="ml-1 text-gray-400">(ID {data.appId})</span>}
            </p>
          )}
        </div>
      </div>

      {/* Token details */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Type de token</p>
          <p className="text-sm font-semibold text-gray-800 capitalize">{data.type ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Expiration</p>
          {data.neverExpires ? (
            <p className="text-sm font-semibold text-green-700">Jamais (token long-lived)</p>
          ) : expiryDate ? (
            <p className={`text-sm font-semibold ${isExpiringSoon ? 'text-orange-600' : 'text-gray-800'}`}>
              {expiryDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              {isExpiringSoon && <span className="ml-1 text-orange-500">⚠ Bientôt</span>}
            </p>
          ) : (
            <p className="text-sm text-gray-400">—</p>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Compte pub configuré</p>
          <p className="text-sm font-semibold text-gray-800 font-mono">
            {data.adAccountId ?? <span className="text-red-500">Non défini</span>}
          </p>
        </div>
      </div>

      {/* Permissions */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Permissions accordées
          <span className="ml-2 text-xs font-normal text-gray-400">({data.scopes.length})</span>
        </h3>
        {data.scopes.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune permission détectée.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.scopes.map((scope) => (
              <ScopeBadge key={scope} scope={scope} />
            ))}
          </div>
        )}
      </div>

      {/* Ad accounts accessible */}
      {data.adAccounts.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Comptes publicitaires accessibles
            <span className="ml-2 text-xs font-normal text-gray-400">({data.adAccounts.length})</span>
          </h3>
          <ul className="divide-y divide-gray-100">
            {data.adAccounts.map((acc) => (
              <li key={acc.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-800">{acc.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{acc.id}</p>
                </div>
                <AccountStatusBadge status={acc.account_status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
