'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Bell, MapPin, Package, Plus, Trash2, UserRound } from 'lucide-react';
import { useStore } from '@/components/provider';
import { Gate } from '@/components/gate';
import { api, json, useApi } from '@/lib/api';
import { Address } from '@/lib/types';
import { Action, ErrorBox, Modal, PageTitle } from '@/components/ui';
import { AddressForm } from '@/components/address-form';
function Account() {
  const { user, refresh, toast } = useStore(),
    addresses = useApi<Address[]>('/profile/addresses'),
    notifications =
      useApi<{ id: string; title: string; body: string; read: boolean; createdAt: string }[]>(
        '/profile/notifications',
      ),
    [modal, setModal] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="container page">
      <PageTitle
        eyebrow="YOUR CORNER OF BAZAAR"
        title={`Hello, ${user?.name.split(' ')[0]}.`}
        description="Your details, your discoveries, your everyday."
        action={
          <Link
            href={
              user?.role === 'PLATFORM_ADMIN' || user?.role === 'SUPPORT_AGENT'
                ? '/admin'
                : user?.role.startsWith('VENDOR')
                  ? '/vendor'
                  : '/orders'
            }
            className="button secondary"
          >
            {user?.role === 'CUSTOMER' ? 'My orders' : 'Open dashboard'} →
          </Link>
        }
      />
      <div className="account-tools">
        <Link className="button secondary" href="/rewards">
          Rewards & referrals →
        </Link>
        <Link className="button secondary" href="/subscriptions">
          Subscriptions →
        </Link>
        <Link className="button secondary" href="/business">
          Business buying →
        </Link>
        <Link className="button secondary" href="/activity">
          <Bell size={18} />
          Price & stock alerts
        </Link>
        <Link className="button secondary" href="/discover">
          Your discovery edit →
        </Link>
      </div>
      <div className="account-grid">
        <section className="panel">
          <h2>
            <UserRound size={21} /> The basics
          </h2>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(
                  '/profile',
                  json({ name: new FormData(e.currentTarget).get('name') }, 'PATCH'),
                );
                await refresh();
                toast('Your details are up to date');
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              Your name
              <input name="name" defaultValue={user?.name} minLength={2} maxLength={80} required />
            </label>
            <label>
              Email address
              <input value={user?.email || ''} disabled />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button">Save details</button>
          </form>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>
              <MapPin size={21} /> Your addresses
            </h2>
            <button className="text-link" onClick={() => setModal(true)}>
              <Plus size={17} />
              Add
            </button>
          </div>
          {addresses.error && <ErrorBox message={addresses.error} />}
          <div className="address-list">
            {addresses.data?.map((a) => (
              <article key={a.id}>
                <div>
                  <strong>
                    {a.label} · {a.name}
                  </strong>
                  <p>
                    {a.line1}
                    <br />
                    {a.city} {a.postalCode}
                    <br />
                    {a.phone}
                  </p>
                </div>
                <Action
                  className="icon-button"
                  onClick={async () => {
                    try {
                      await api(`/profile/addresses/${a.id}`, { method: 'DELETE' });
                      await addresses.refresh();
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  <Trash2 size={18} />
                  <span className="sr-only">Remove address</span>
                </Action>
              </article>
            ))}
          </div>
          {!addresses.data?.length && (
            <p className="muted">Add an address for an easier checkout.</p>
          )}
        </section>
        <section className="panel notifications-panel">
          <div className="section-heading">
            <h2>
              <Bell size={21} /> A little update
            </h2>
            <Action
              className="text-link"
              onClick={async () => {
                await api('/profile/notifications/read', json({}, 'PATCH'));
                await notifications.refresh();
              }}
            >
              Mark all read
            </Action>
          </div>
          {notifications.data?.length ? (
            notifications.data.map((n) => (
              <article className={`notification ${!n.read ? 'unread' : ''}`} key={n.id}>
                <Package size={20} />
                <div>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>{new Date(n.createdAt).toLocaleString()}</small>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">You’re all caught up. Order updates will appear here.</p>
          )}
        </section>
      </div>
      {modal && (
        <Modal title="Add a delivery address" close={() => setModal(false)}>
          <AddressForm
            done={() => {
              setModal(false);
              void addresses.refresh();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
export default function AccountPage() {
  return (
    <Gate>
      <Account />
    </Gate>
  );
}
