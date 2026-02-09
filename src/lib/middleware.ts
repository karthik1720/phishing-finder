import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractTokenFromHeader } from './auth';
import { prisma } from './prisma';

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    userId: string;
    email: string;
    role: 'USER' | 'ADMIN';
  };
}

/**
 * Middleware to verify JWT token and attach user to request
 */
export async function requireAuth(request: NextRequest): Promise<{ user: any; error?: NextResponse }> {
  const authHeader = request.headers.get('Authorization');
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Unauthorized - No token provided' }, { status: 401 }),
    };
  }

  const payload = verifyToken(token);
  if (!payload) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 }),
    };
  }

  // Verify user still exists in database
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Unauthorized - User not found' }, { status: 401 }),
    };
  }

  return {
    user: {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Middleware to require admin role
 */
export async function requireAdmin(request: NextRequest): Promise<{ user: any; error?: NextResponse }> {
  const authResult = await requireAuth(request);
  
  if (authResult.error) {
    return authResult;
  }

  if (authResult.user?.role !== 'ADMIN') {
    return {
      user: null,
      error: NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 }),
    };
  }

  return authResult;
}

