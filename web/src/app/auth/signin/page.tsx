'use client'

import { signIn } from 'next-auth/react'
import { Code2 } from 'lucide-react'

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-brand-900 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Code2 className="w-8 h-8 text-brand-600" />
          <div className="text-left">
            <p className="text-lg font-bold text-gray-900 leading-tight">OpenCode</p>
            <p className="text-sm text-gray-500 leading-tight">Code Review</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Sign in with your corporate Azure AD account to access the code review
          management portal.
        </p>

        <button
          onClick={() => signIn('azure-ad', { callbackUrl: '/dashboard' })}
          className="w-full btn-primary justify-center py-2.5"
        >
          Sign in with Microsoft
        </button>

        <p className="mt-4 text-xs text-gray-400">
          This portal is restricted to authenticated corporate users only.
        </p>
      </div>
    </div>
  )
}
