import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkPhishingUrlWithLangChain } from '@/lib/langchain-phishing';
import { normalizeUrl } from '@/lib/gemini';
import { requireAuth } from '@/lib/middleware';

/**
 * Extracts the base domain from a URL (e.g., https://chatgpt.com from https://chatgpt.com/c/123)
 * This ensures we check domains once, not every sub-path
 */
function getBaseDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Remove 'www.' prefix if present
    const domain = hostname.replace(/^www\./, '');
    
    // Return protocol + domain (no path, no query params)
    return `${urlObj.protocol}//${domain}`;
  } catch {
    // Fallback: try to extract domain from string
    const match = url.match(/https?:\/\/([^\/]+)/i);
    if (match) {
      const hostname = match[1].toLowerCase().replace(/^www\./, '');
      const protocol = url.startsWith('https') ? 'https://' : 'http://';
      return `${protocol}${hostname}`;
    }
    return url;
  }
}

/**
 * Extract IP address from request headers
 */
function getIpAddress(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  return null;
}

/**
 * Create audit record for user visit
 */
async function createAuditRecord(
  userId: string,
  url: string,
  result: {
    isPhishing: boolean;
    hasWarning: boolean;
    warningType?: string[];
    warningSeverity?: string;
    warningReason?: string;
  },
  action: 'BLOCKED' | 'ALLOWED' | 'WARNING_SHOWN',
  ipAddress: string | null,
  userAgent: string | null
) {
  try {
    await prisma.auditRecord.create({
      data: {
        userId,
        url,
        isPhishing: result.isPhishing,
        hasWarning: result.hasWarning || false,
        warningType: result.warningType ? result.warningType.join(',') : null,
        warningSeverity: result.warningSeverity || null,
        warningReason: result.warningReason || null,
        action,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error('[check-url] Error creating audit record:', error);
    // Don't fail the request if audit record creation fails
  }
}

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.error;
    }
    const user = authResult.user;
    const userId = user.userId;

    const body = await request.json();
    const { url, forceRefresh, checkOnly } = body;

    // Extract IP and user agent for audit records
    const ipAddress = getIpAddress(request);
    const userAgent = request.headers.get('user-agent') || null;

    console.log('[check-url] Received request for URL:', url, 'forceRefresh:', forceRefresh, 'checkOnly:', checkOnly, 'userId:', userId);

    if (!url || typeof url !== 'string') {
      console.warn('[check-url] Invalid request: URL is missing or not a string');
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Extract base domain for checking (extension should send this, but we handle both)
    const baseDomain = getBaseDomain(url);
    console.log('[check-url] Base domain:', baseDomain);
    
    // Normalize base domain for consistent checking
    const normalizedUrl = normalizeUrl(baseDomain);
    console.log('[check-url] Normalized URL:', normalizedUrl);

    // Always check database cache first (unless forceRefresh is true)
    if (!forceRefresh) {
      console.log('[check-url] Checking database for cached result...');
      const existingCheck = await prisma.urlCheck.findUnique({
        where: { url: normalizedUrl },
      });

      if (existingCheck) {
        // Return cached result
        console.log('[check-url] Found cached result:', {
          isPhishing: existingCheck.isPhishing,
          hasWarning: existingCheck.hasWarning,
          cached: true,
        });

        // Create audit record if user is authenticated and URL is harmful/warning
        if (userId && (existingCheck.isPhishing || existingCheck.hasWarning)) {
          const action = existingCheck.isPhishing
            ? 'BLOCKED'
            : existingCheck.hasWarning
            ? 'WARNING_SHOWN'
            : 'ALLOWED';
          
          await createAuditRecord(
            userId,
            url, // Use original URL, not normalized
            {
              isPhishing: existingCheck.isPhishing,
              hasWarning: existingCheck.hasWarning,
              warningType: existingCheck.warningType ? existingCheck.warningType.split(',') : undefined,
              warningSeverity: existingCheck.warningSeverity || undefined,
              warningReason: existingCheck.warningReason || undefined,
            },
            action,
            ipAddress,
            userAgent
          );
        }

        return NextResponse.json({
          isPhishing: existingCheck.isPhishing,
          hasWarning: existingCheck.hasWarning || false,
          warningType: existingCheck.warningType ? existingCheck.warningType.split(',') : undefined,
          warningSeverity: existingCheck.warningSeverity || undefined,
          warningReason: existingCheck.warningReason || undefined,
          reason: existingCheck.reason || undefined,
          confidence: existingCheck.confidence || undefined,
          cached: true,
        });
      }

      // If checkOnly is true and not in cache, return notFound without calling AI
      if (checkOnly) {
        console.log('[check-url] checkOnly=true and no cache found, returning notFound');
        return NextResponse.json({
          notFound: true,
          cached: false,
        });
      }
    } else {
      console.log('[check-url] Force refresh requested, bypassing cache');
    }

    console.log('[check-url] Calling LangChain service for fresh AI check...');
    // Check with LangChain (which may use tools if uncertain)
    const checkResult = await checkPhishingUrlWithLangChain(normalizedUrl);
    console.log('[check-url] LangChain result:', {
      isPhishing: checkResult.isPhishing,
      hasWarning: checkResult.hasWarning,
      warningType: checkResult.warningType,
      confidence: checkResult.confidence,
      hasReason: !!checkResult.reason,
      toolUsed: checkResult.toolUsed || false,
    });

    // Store or update result in database
    console.log('[check-url] Storing/updating result in database...');
    await prisma.urlCheck.upsert({
      where: { url: normalizedUrl },
      update: {
        isPhishing: checkResult.isPhishing,
        hasWarning: checkResult.hasWarning || false,
        warningType: checkResult.warningType ? checkResult.warningType.join(',') : null,
        warningSeverity: checkResult.warningSeverity || null,
        warningReason: checkResult.warningReason || null,
        confidence: checkResult.confidence,
        reason: checkResult.reason,
        checkedAt: new Date(),
        userId: userId || undefined, // Store userId if provided
      },
      create: {
        url: normalizedUrl,
        isPhishing: checkResult.isPhishing,
        hasWarning: checkResult.hasWarning || false,
        warningType: checkResult.warningType ? checkResult.warningType.join(',') : null,
        warningSeverity: checkResult.warningSeverity || null,
        warningReason: checkResult.warningReason || null,
        confidence: checkResult.confidence,
        reason: checkResult.reason,
        userId: userId || undefined, // Store userId if provided
      },
    });
    console.log('[check-url] Result stored/updated successfully');

    // Create audit record if user is authenticated and URL is harmful/warning
    if (userId && (checkResult.isPhishing || checkResult.hasWarning)) {
      const action = checkResult.isPhishing
        ? 'BLOCKED'
        : checkResult.hasWarning
        ? 'WARNING_SHOWN'
        : 'ALLOWED';
      
      await createAuditRecord(
        userId,
        url, // Use original URL, not normalized
        {
          isPhishing: checkResult.isPhishing,
          hasWarning: checkResult.hasWarning || false,
          warningType: checkResult.warningType,
          warningSeverity: checkResult.warningSeverity,
          warningReason: checkResult.warningReason,
        },
        action,
        ipAddress,
        userAgent
      );
    }

    const response = {
      isPhishing: checkResult.isPhishing,
      hasWarning: checkResult.hasWarning || false,
      warningType: checkResult.warningType || undefined,
      warningSeverity: checkResult.warningSeverity || undefined,
      warningReason: checkResult.warningReason || undefined,
      reason: checkResult.reason || undefined,
      confidence: checkResult.confidence || undefined,
      cached: false,
    };
    console.log('[check-url] Returning response:', response);
    return NextResponse.json(response);
  } catch (error) {
    console.error('[check-url] Error in check-url API:', error);
    if (error instanceof Error) {
      console.error('[check-url] Error message:', error.message);
      console.error('[check-url] Error stack:', error.stack);
    }
    // Fail open - allow navigation if there's an error
    return NextResponse.json({
      isPhishing: false,
      cached: false,
      error: 'Unable to check URL',
    });
  }
}

