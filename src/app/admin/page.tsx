"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { UrlTable } from './components/url-table'
import { AuditTable } from './components/audit-table'

export default function AdminPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const storedToken = localStorage.getItem('adminToken')
    if (!storedToken) {
      router.push('/admin/login')
    } else {
      setToken(storedToken)
    }
  }, [router])

  if (!mounted || !token) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div>Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <Tabs defaultValue="urls" className="w-full">
        <TabsList>
          <TabsTrigger value="urls">URL Checks</TabsTrigger>
          <TabsTrigger value="audit">Audit Records</TabsTrigger>
        </TabsList>
        <TabsContent value="urls">
          <UrlTable token={token} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTable token={token} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

