"use client"

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface UrlCheck {
  id: string
  url: string
  isPhishing: boolean
  hasWarning: boolean
  warningType: string | null
  warningSeverity: string | null
  warningReason: string | null
  confidence: number | null
  checkedAt: string
  createdAt: string
}

interface UrlTableProps {
  token: string
}

export function UrlTable({ token }: UrlTableProps) {
  const [data, setData] = useState<UrlCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [sortBy, setSortBy] = useState('checkedAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [isPhishingFilter, setIsPhishingFilter] = useState<string>('')
  const [hasWarningFilter, setHasWarningFilter] = useState<string>('')
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
      
      if (search) params.append('search', search)
      if (isPhishingFilter) params.append('isPhishing', isPhishingFilter)
      if (hasWarningFilter) params.append('hasWarning', hasWarningFilter)

      const response = await fetch(`/api/admin/urls?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch URLs')
      }

      const result = await response.json()
      setData(result.data)
      setTotalPages(result.pagination.totalPages)
      setTotal(result.pagination.total)
    } catch (error) {
      console.error('Error fetching URLs:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [page, sortBy, sortOrder, search, isPhishingFilter, hasWarningFilter, limit])

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
        <CardTitle>URL Checks</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <Input
              placeholder="Search URLs..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="flex-1 min-w-[200px]"
            />
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
            <Select
              value={hasWarningFilter}
              onChange={(e) => {
                setHasWarningFilter(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All Warning Status</option>
              <option value="true">Has Warning</option>
              <option value="false">No Warning</option>
            </Select>
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
                    onClick={() => handleSort('url')}
                  >
                    URL {sortBy === 'url' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="h-12 px-4 text-left align-middle font-medium cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('isPhishing')}
                  >
                    Phishing {sortBy === 'isPhishing' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="h-12 px-4 text-left align-middle font-medium cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('hasWarning')}
                  >
                    Warning {sortBy === 'hasWarning' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium">Warning Type</th>
                  <th
                    className="h-12 px-4 text-left align-middle font-medium cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('confidence')}
                  >
                    Confidence {sortBy === 'confidence' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="h-12 px-4 text-left align-middle font-medium cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('checkedAt')}
                  >
                    Checked At {sortBy === 'checkedAt' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="h-24 text-center">
                      Loading...
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="h-24 text-center">
                      No URLs found
                    </td>
                  </tr>
                ) : (
                  data.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-4">
                        <div className="max-w-[300px] truncate" title={item.url}>
                          {item.url}
                        </div>
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
                      <td className="p-4 text-sm">
                        {item.warningType || '-'}
                      </td>
                      <td className="p-4">
                        {item.confidence !== null
                          ? `${(item.confidence * 100).toFixed(0)}%`
                          : '-'}
                      </td>
                      <td className="p-4 text-sm">{formatDate(item.checkedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} URLs
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

