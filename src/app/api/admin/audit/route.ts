import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/middleware';

export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const authResult = await requireAdmin(request);
    if (authResult.error) {
      return authResult.error;
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const sortBy = searchParams.get('sortBy') || 'visitedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const actionFilter = searchParams.get('action');
    const isPhishingFilter = searchParams.get('isPhishing');
    const userIdFilter = searchParams.get('userId');
    const userSearch = searchParams.get('userSearch') || '';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Build where clause
    const where: any = {};
    
    if (actionFilter) {
      where.action = actionFilter;
    }
    
    if (isPhishingFilter !== null && isPhishingFilter !== undefined) {
      where.isPhishing = isPhishingFilter === 'true';
    }
    
    if (userIdFilter) {
      where.userId = userIdFilter;
    }

    if (userSearch) {
      where.user = {
        email: {
          contains: userSearch,
          mode: 'insensitive',
        },
      };
    }

    if (dateFrom || dateTo) {
      where.visitedAt = {};
      if (dateFrom) {
        where.visitedAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.visitedAt.lte = new Date(dateTo);
      }
    }

    // Build orderBy clause
    const orderBy: any = {};
    const validSortFields = ['visitedAt', 'createdAt', 'action', 'isPhishing'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'visitedAt';
    orderBy[sortField] = sortOrder === 'asc' ? 'asc' : 'desc';

    // Get total count
    const total = await prisma.auditRecord.count({ where });

    // Get paginated results with user info
    const skip = (page - 1) * limit;
    const auditRecords = await prisma.auditRecord.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      data: auditRecords,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching audit records:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

