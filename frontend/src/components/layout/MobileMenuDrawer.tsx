'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import type { User } from '@/types';

interface NavItem {
  name: string;
  href: string;
}

interface MobileMenuDrawerProps {
  open: boolean;
  onClose: () => void;
  navigation: NavItem[];
  user: User | null;
  logout: () => void;
  pathname: string;
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function MobileMenuDrawer({
  open,
  onClose,
  navigation,
  user,
  logout,
  pathname,
}: MobileMenuDrawerProps) {
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-40" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" />
        </Transition.Child>
        <div className="fixed inset-0 flex">
          <Transition.Child
            as={Fragment}
            enter="transform transition ease-in-out duration-300"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="transform transition ease-in-out duration-300"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <Dialog.Panel className="relative flex w-full max-w-xs flex-col bg-white pb-4 shadow-xl">
              <div className="flex items-center justify-between px-4 pt-4">
                <h2 className="text-lg font-medium">Menu</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  <span className="sr-only">Close menu</span>
                  <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-4 space-y-1 px-2">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={onClose}
                    className={classNames(
                      pathname === item.href
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                        : 'border-transparent text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900',
                      'block border-l-4 px-3 py-2 text-base font-medium'
                    )}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
              <div className="mt-4 border-t border-gray-200 pt-4 px-2">
                {user ? (
                  <>
                    <Link
                      href="/dashboard"
                      onClick={onClose}
                      className="block px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Dashboard
                    </Link>
                    {user.user_type === 'artist' && (
                      <Link
                    href="/dashboard/profile/edit"
                    onClick={onClose}
                    className="block px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    Edit Profile
                  </Link>
                )}
                {user.user_type === 'artist' && (
                  <Link
                    href="/dashboard/quotes"
                    onClick={onClose}
                    className="block px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  >
                    Quotes
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    onClose();
                      }}
                      className="block w-full text-left px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={onClose}
                      className="block px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/register"
                      onClick={onClose}
                      className="block px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Sign up
                    </Link>
                  </>
                )}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
