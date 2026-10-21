'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlusIcon } from './ui';

const ITEMS = [
  { href: '/', label: 'วันนี้' },
  { href: '/history', label: 'ประวัติ' },
  { href: '/library', label: 'คลัง' },
  { href: '/profile', label: 'โปรไฟล์' },
];

/** Floating pill nav (Nutri.BottomNav) + optional add-meal FAB, fixed to the bottom. */
export function BottomNav({ fab = false }: { fab?: boolean }) {
  const path = usePathname();
  return (
    <div className="dock">
      {fab && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 24px 16px' }}>
          <Link href="/add" className="nu-fab" aria-label="เพิ่มมื้อ">
            <PlusIcon />
          </Link>
        </div>
      )}
      <nav className="nu-nav" aria-label="เมนูหลัก">
        {ITEMS.map((it) => {
          const on = it.href === '/' ? path === '/' : path.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`nu-nav-item${on ? ' is-active' : ''}`}
              aria-current={on ? 'page' : undefined}
              style={{ textDecoration: 'none' }}
            >
              <span className="nu-nav-label">{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
