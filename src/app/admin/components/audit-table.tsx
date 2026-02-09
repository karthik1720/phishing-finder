"use client"

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface AuditRecord {
  id: string
  userId: string
  url: string
  isPhishing: boolean
  hasWarning: boolean
  warningType: string | null
  warningSeverity: string | null
  warningReason: string | null
  action: 'BLOCKED' | 'ALLOWED' | 'WARNING_SHOWN'
  ipAddress: string | null
  userAgent: string | null
  visitedAt: string
  createdAt: string
  user: {
    id: string
    email: string
  }
}

interface AuditTableProps {
  token: string
}

export function AuditTable({ token }: AuditTableProps) {
  const [data, setData] = useState<AuditRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('visitedAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [actionFilter, setActionFilter] = useState('')
  const [isPhishingFilter, setIsPhishingFilter] = useState<string>('')
  const [userSearch, setUserSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [limit, setLimit] = useState(50)

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder,
      })
      
      if (actionFilter) params.append('action', actionFilter)
      if (isPhishingFilter) params.append('isPhishing', isPhishingFilter)
      if (userSearch) params.append('userSearch', userSearch)
      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)

      const response = await fetch(`/api/admin/audit?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch audit records')
      }

      const result = await response.json()
      setData(result.data)
      setTotalPages(result.pagination.totalPages)
      setTotal(result.pagination.total)
    } catch (error) {
      console.error('Error fetching audit records:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [page, sortBy, sortOrder, actionFilter, isPhishingFilter, userSearch, dateFrom, dateTo, limit])

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
    setPage(1)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Records</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <Input
              placeholder="Search user email..."
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value)
                setPage(1)
              }}
              className="flex-1 min-w-[200px]"
            />
            <Select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All Actions</option>
              <option value="BLOCKED">Blocked</option>
              <option value="WARNING_SHOWN">Warning Shown</option>
              <option value="ALLOWED">Allowed</option>
            </Select>
            <Select
              value={isPhishingFilter}
              onChange={(e) => {
                setIsPhishingFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All Phishing Status</option>
              <option value="true">Phishing</option>
              <option value="false">Safe</option>
            </Select>
            <Input
              type="date"
              placeholder="From Date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              className="w-[150px]"
            />
            <Input
              type="date"
              placeholder="To Date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              className="w-[150px]"
            />
            <Select
              value={limit.toString()}
              onChange={(e) => {
                setLimit(Number(e.target.value))
                setPage(1)
              }}
            >
              <option value="25">25 per page</option>
              <option value="50">50 per page</option>
              <option value="100">100 per page</option>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th
                    className="h-12 px-4 text-left align-middle font-medium cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('visitedAt')}
                  >
                    User Email
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium">URL</th>
                  <th
                    className="h-12 px-4 text-left align-middle font-medium cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('action')}
                  >
                    Action {sortBy === 'action' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium">Phishing</th>
                  <th className="h-12 px-4 text-left align-middle font-medium">Warning</th>
                  <th className="h-12 px-4 text-left align-middle font-medium">Warning Details</th>
                  <th className="h-12 px-4 text-left align-middle font-medium">IP Address</th>
                  <th
                    className="h-12 px-4 text-left align-middle font-medium cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('visitedAt')}
                  >
                    Visited At {sortBy === 'visitedAt' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="h-24 text-center">
                      Loading...
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="h-24 text-center">
                      No audit records found
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-4 text-sm">{item.user.email}</td>
                      <td className="p-4">
                        <div className="max-w-[200px] truncate" title={item.url}>
                          {item.url}
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            item.action === 'BLOCKED'
                              ? 'bg-red-100 text-red-800'
                              : item.action === 'WARNING_SHOWN'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {item.action}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            item.isPhishing
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {item.isPhishing ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            item.hasWarning
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {item.hasWarning ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="p-4 text-sm max-w-[200px]">
                        <div className="truncate" title={item.warningReason || item.warningType || '-'}>
                          {item.warningReason || item.warningType || '-'}
                        </div>
                      </td>
                      <td className="p-4 text-sm">{item.ipAddress || '-'}</td>
                      <td className="p-4 text-sm">{formatDate(item.visitedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} records
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                Previous
              </Button>
              <span className="flex items-center px-4 text-sm">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

