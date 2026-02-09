"use client"

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<{ email: string; role: string } | null>(null)
  const isLoginPage = pathname === '/admin/login'

  useEffect(() => {
    // Skip auth check on login page
    if (isLoginPage) {
      return
    }

    // Check for token in localStorage (for web) or get from chrome.storage (for extension)
    const storedToken = localStorage.getItem('adminToken')
    if (storedToken) {
      setToken(storedToken)
      // Decode token to get user info (simple base64 decode of payload)
      try {
        const payload = JSON.parse(atob(storedToken.split('.')[1]))
        setUser({ email: payload.email, role: payload.role })
      } catch (e) {
        console.error('Error decoding token:', e)
      }
    } else {
      router.push('/admin/login')
    }
  }, [router, isLoginPage])

  const handleLogout = () => {
    localStorage.removeItem('adminToken')
    router.push('/admin/login')
  }

  // On login page, render children without header
  if (isLoginPage) {
    return <>{children}</>
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-muted-foreground">
                {user.email} ({user.role})
              </span>
            )}
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  )
}

