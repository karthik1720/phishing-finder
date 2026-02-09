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
    const sortBy = searchParams.get('sortBy') || 'checkedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const search = searchParams.get('search') || '';
    const isPhishingFilter = searchParams.get('isPhishing');
    const hasWarningFilter = searchParams.get('hasWarning');

    // Build where clause
    const where: any = {};
    
    if (search) {
      where.url = {
        contains: search,
        mode: 'insensitive',
      };
    }
    
    if (isPhishingFilter !== null && isPhishingFilter !== undefined) {
      where.isPhishing = isPhishingFilter === 'true';
    }
    
    if (hasWarningFilter !== null && hasWarningFilter !== undefined) {
      where.hasWarning = hasWarningFilter === 'true';
    }

    // Build orderBy clause
    const orderBy: any = {};
    const validSortFields = ['url', 'checkedAt', 'createdAt', 'confidence', 'isPhishing', 'hasWarning'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'checkedAt';
    orderBy[sortField] = sortOrder === 'asc' ? 'asc' : 'desc';

    // Get total count
    const total = await prisma.urlCheck.count({ where });

    // Get paginated results
    const skip = (page - 1) * limit;
    const urlChecks = await prisma.urlCheck.findMany({
      where,
      orderBy,
      skip,
      take: limit,
    });

    return NextResponse.json({
      data: urlChecks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching URLs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

