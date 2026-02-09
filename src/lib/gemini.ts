import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash-exp';

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey);

export interface PhishingCheckResult {
  isPhishing: boolean;
  confidence?: number;
  reason?: string;
}

/**
 * Normalizes a URL for consistent checking
 * - Removes trailing slashes
 * - Converts to lowercase
 * - Removes common tracking parameters
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove trailing slash from pathname
    urlObj.pathname = urlObj.pathname.replace(/\/$/, '');
    // Convert to lowercase
    urlObj.hostname = urlObj.hostname.toLowerCase();
    // Remove common tracking parameters
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'];
    trackingParams.forEach(param => urlObj.searchParams.delete(param));
    return urlObj.toString();
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Checks if a URL is a phishing site using Gemini LLM
 */
export async function checkPhishingUrl(url: string): Promise<PhishingCheckResult> {
  try {
    console.log('[gemini] Starting phishing check for URL:', url);
    const normalizedUrl = normalizeUrl(url);
    console.log('[gemini] Using model:', modelName);
    
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `Analyze the following URL and determine if it is a phishing site. Consider:
1. Domain name suspicious patterns (typosquatting, lookalike domains)
2. URL structure and path anomalies
3. Known phishing indicators
4. SSL certificate validity (if applicable)
5. Domain age and reputation

URL: ${normalizedUrl}

Respond with a JSON object in this exact format:
{
  "isPhishing": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "Brief explanation of why this is or isn't phishing"
}

Only respond with valid JSON, no additional text.`;

    console.log('[gemini] Sending request to Gemini API...');
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    const duration = Date.now() - startTime;
    console.log(`[gemini] Received response in ${duration}ms`);
    console.log('[gemini] Raw response:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));

    // Try to extract JSON from the response
    let jsonText = text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
      console.log('[gemini] Extracted JSON:', jsonText);
    } else {
      console.warn('[gemini] No JSON match found in response, using full text');
    }

    const parsed = JSON.parse(jsonText);
    console.log('[gemini] Parsed result:', {
      isPhishing: parsed.isPhishing,
      confidence: parsed.confidence,
      hasReason: !!parsed.reason,
    });

    const finalResult = {
      isPhishing: Boolean(parsed.isPhishing),
      confidence: parsed.confidence ? parseFloat(parsed.confidence) : undefined,
      reason: parsed.reason || undefined,
    };
    
    console.log('[gemini] Returning result:', finalResult);
    return finalResult;
  } catch (error) {
    console.error('[gemini] Error checking URL with Gemini:', error);
    if (error instanceof Error) {
      console.error('[gemini] Error message:', error.message);
      console.error('[gemini] Error stack:', error.stack);
    }
    // Fail open - if we can't check, allow the URL
    return {
      isPhishing: false,
      reason: 'Unable to verify URL due to API error',
    };
  }
}

export { normalizeUrl };

