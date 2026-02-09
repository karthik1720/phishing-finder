import * as cheerio from 'cheerio';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

export interface WebsiteContentAnalysis {
  url: string;
  title: string;
  metaDescription?: string;
  scripts: {
    inline: string[];
    external: string[];
    suspiciousPatterns: string[];
  };
  forms: {
    count: number;
    fields: Array<{
      type: string;
      name?: string;
      placeholder?: string;
    }>;
    actions: string[];
  };
  links: {
    internal: number;
    external: number;
    suspiciousDomains: string[];
  };
  suspiciousIndicators: string[];
  htmlStructure: {
    hasHiddenElements: boolean;
    hasObfuscatedCode: boolean;
    hasSuspiciousRedirects: boolean;
  };
}

/**
 * Tool for fetching and analyzing website content
 */
export class FetchWebsiteContentTool extends StructuredTool {
  name = 'fetchWebsiteContent';
  
  description = `Fetches and analyzes website HTML content and JavaScript for phishing indicators. 
Use this tool when you need to examine the actual content of a website to determine if it's a phishing site.
The tool will extract scripts, forms, links, and identify suspicious patterns.`;

  schema = z.object({
    url: z.string().describe('The URL to fetch and analyze'),
  });

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters for English text)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    // This is a conservative estimate for Gemini models
    return Math.ceil(text.length / 4);
  }

  /**
   * Trim content to fit within token limit (keeps first 10k tokens)
   */
  private trimToTokenLimit(analysis: WebsiteContentAnalysis, maxTokens: number = 10000): WebsiteContentAnalysis {
    // Convert to JSON to check total size
    let jsonString = JSON.stringify(analysis, null, 2);
    let tokenCount = this.estimateTokens(jsonString);

    if (tokenCount <= maxTokens) {
      return analysis;
    }

    console.log(`[fetch-website-content] Content exceeds ${maxTokens} tokens (${tokenCount}), trimming to first ${maxTokens} tokens...`);

    // Create a trimmed copy
    const trimmed: WebsiteContentAnalysis = {
      ...analysis,
      scripts: {
        ...analysis.scripts,
        inline: [...analysis.scripts.inline],
      },
    };

    // Calculate base size without inline scripts
    const baseAnalysis = {
      ...trimmed,
      scripts: { ...trimmed.scripts, inline: [] },
    };
    const baseJson = JSON.stringify(baseAnalysis, null, 2);
    const baseTokens = this.estimateTokens(baseJson);
    const availableForScripts = Math.max(0, maxTokens - baseTokens);

    if (availableForScripts <= 0) {
      // Even without scripts, we're over limit - trim other fields
      trimmed.scripts.inline = [];
      if (trimmed.metaDescription && trimmed.metaDescription.length > 100) {
        trimmed.metaDescription = trimmed.metaDescription.substring(0, 100) + '...';
      }
      trimmed.suspiciousIndicators = trimmed.suspiciousIndicators.slice(0, 10);
      trimmed.forms.fields = trimmed.forms.fields.slice(0, 20);
      trimmed.scripts.external = trimmed.scripts.external.slice(0, 10);
    } else {
      // Trim inline scripts to fit within available token budget
      // Distribute tokens evenly across scripts, keeping first part of each
      const scriptsCount = trimmed.scripts.inline.length || 1;
      const tokensPerScript = Math.floor(availableForScripts / scriptsCount);
      const charsPerScript = tokensPerScript * 4; // 1 token ≈ 4 chars

      trimmed.scripts.inline = trimmed.scripts.inline.map(script => {
        if (this.estimateTokens(script) <= tokensPerScript) {
          return script;
        }
        // Keep first N characters (first 10k tokens worth)
        return script.substring(0, charsPerScript) + '... [trimmed]';
      });
    }

    // Verify final size
    const finalJson = JSON.stringify(trimmed, null, 2);
    const finalTokens = this.estimateTokens(finalJson);
    
    if (finalTokens > maxTokens) {
      // If still over, do more aggressive trimming
      const ratio = maxTokens / finalTokens;
      trimmed.scripts.inline = trimmed.scripts.inline.map(script => {
        const targetLength = Math.floor(script.length * ratio);
        return script.substring(0, targetLength) + '... [trimmed]';
      });
    }

    const verifiedJson = JSON.stringify(trimmed, null, 2);
    const verifiedTokens = this.estimateTokens(verifiedJson);
    console.log(`[fetch-website-content] Trimmed content from ${tokenCount} to ${verifiedTokens} tokens`);

    return trimmed;
  }

  async _call(input: { url: string }): Promise<string> {
    try {
      console.log('[fetch-website-content] Fetching URL:', input.url);
      
      const analysis = await this.fetchAndAnalyze(input.url);
      
      // Trim content to 10k tokens if needed
      const trimmedAnalysis = this.trimToTokenLimit(analysis, 10000);
      
      // Return structured JSON string for AI consumption
      return JSON.stringify(trimmedAnalysis, null, 2);
    } catch (error) {
      console.error('[fetch-website-content] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return JSON.stringify({
        error: `Failed to fetch website content: ${errorMessage}`,
        url: input.url,
      });
    }
  }

  private async fetchAndAnalyze(url: string): Promise<WebsiteContentAnalysis> {
    // Fetch HTML content with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract basic info
      const title = $('title').text().trim() || 'No title';
      const metaDescription = $('meta[name="description"]').attr('content') || 
                             $('meta[property="og:description"]').attr('content');

      // Extract scripts
      const scripts = this.extractScripts($);
      
      // Extract forms
      const forms = this.extractForms($);
      
      // Extract links
      const links = this.extractLinks($, url);
      
      // Identify suspicious patterns
      const suspiciousIndicators = this.identifySuspiciousPatterns($, scripts, forms);

      return {
        url,
        title,
        metaDescription,
        scripts,
        forms,
        links,
        suspiciousIndicators,
        htmlStructure: {
          hasHiddenElements: $('[style*="display:none"], [style*="display: none"], [hidden]').length > 0,
          hasObfuscatedCode: this.hasObfuscatedCode(scripts),
          hasSuspiciousRedirects: this.hasSuspiciousRedirects(scripts, $),
        },
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private extractScripts($: cheerio.CheerioAPI): WebsiteContentAnalysis['scripts'] {
    const inline: string[] = [];
    const external: string[] = [];
    const suspiciousPatterns: string[] = [];

    $('script').each((_, element) => {
      const src = $(element).attr('src');
      const content = $(element).html() || '';

      if (src) {
        external.push(src);
        // Check for suspicious external script sources
        if (this.isSuspiciousScriptSrc(src)) {
          suspiciousPatterns.push(`Suspicious external script: ${src}`);
        }
      } else if (content.trim()) {
        inline.push(content);
        // Check for suspicious patterns in inline scripts
        if (this.isSuspiciousInlineScript(content)) {
          suspiciousPatterns.push('Suspicious inline script detected');
        }
      }
    });

    return { inline, external, suspiciousPatterns };
  }

  private extractForms($: cheerio.CheerioAPI): WebsiteContentAnalysis['forms'] {
    const fields: Array<{ type: string; name?: string; placeholder?: string }> = [];
    const actions: string[] = [];

    $('form').each((_, formElement) => {
      const action = $(formElement).attr('action') || '';
      if (action) {
        actions.push(action);
      }

      $(formElement).find('input, textarea, select').each((_, inputElement) => {
        const type = $(inputElement).attr('type') || $(inputElement).prop('tagName').toLowerCase();
        const name = $(inputElement).attr('name') || '';
        const placeholder = $(inputElement).attr('placeholder') || '';

        fields.push({ type, name, placeholder });
      });
    });

    return {
      count: $('form').length,
      fields,
      actions,
    };
  }

  private extractLinks($: cheerio.CheerioAPI, baseUrl: string): WebsiteContentAnalysis['links'] {
    let internal = 0;
    let external = 0;
    const suspiciousDomains: string[] = [];

    try {
      const baseDomain = new URL(baseUrl).hostname;

      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) return;

        try {
          // Resolve relative URLs
          const absoluteUrl = new URL(href, baseUrl);
          const linkDomain = absoluteUrl.hostname;

          if (linkDomain === baseDomain || linkDomain.endsWith(`.${baseDomain}`)) {
            internal++;
          } else {
            external++;
            // Check for suspicious domains
            if (this.isSuspiciousDomain(linkDomain, baseDomain)) {
              suspiciousDomains.push(linkDomain);
            }
          }
        } catch {
          // Invalid URL, skip
        }
      });
    } catch {
      // Invalid base URL, skip link analysis
    }

    return { internal, external, suspiciousDomains };
  }

  private identifySuspiciousPatterns(
    $: cheerio.CheerioAPI,
    scripts: WebsiteContentAnalysis['scripts'],
    forms: WebsiteContentAnalysis['forms']
  ): string[] {
    const indicators: string[] = [];

    // Check for hidden forms
    if (forms.count > 0) {
      $('form').each((_, formElement) => {
        const form = $(formElement);
        const style = form.attr('style') || '';
        const display = form.css('display');
        
        if (style.includes('display:none') || style.includes('display: none') || display === 'none') {
          indicators.push('Hidden form detected');
        }
      });
    }

    // Check for password fields
    const passwordFields = forms.fields.filter(f => f.type === 'password');
    if (passwordFields.length > 0) {
      indicators.push(`${passwordFields.length} password field(s) found`);
    }

    // Check for suspicious form actions
    forms.actions.forEach(action => {
      if (this.isSuspiciousFormAction(action)) {
        indicators.push(`Suspicious form action: ${action}`);
      }
    });

    // Check for obfuscated code
    if (this.hasObfuscatedCode(scripts)) {
      indicators.push('Obfuscated JavaScript detected');
    }

    // Check for suspicious meta tags
    const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
    if (metaRefresh && this.isSuspiciousRedirect(metaRefresh)) {
      indicators.push('Suspicious meta refresh redirect');
    }

    return indicators;
  }

  private isSuspiciousScriptSrc(src: string): boolean {
    // Check for suspicious patterns in script sources
    const suspiciousPatterns = [
      /eval/i,
      /base64/i,
      /data:/i,
      /javascript:/i,
    ];
    return suspiciousPatterns.some(pattern => pattern.test(src));
  }

  private isSuspiciousInlineScript(content: string): boolean {
    // Check for suspicious patterns in inline scripts
    const suspiciousPatterns = [
      /eval\s*\(/i,
      /document\.write/i,
      /innerHTML\s*=/i,
      /atob\s*\(/i,
      /fromCharCode/i,
      /String\.fromCharCode/i,
      /unescape\s*\(/i,
      /escape\s*\(/i,
      /setTimeout\s*\(/i,
      /setInterval\s*\(/i,
      /location\.href\s*=/i,
      /window\.location/i,
    ];

    // Check for obfuscation patterns
    const obfuscationPatterns = [
      /\\x[0-9a-f]{2}/gi,
      /\\u[0-9a-f]{4}/gi,
      /%[0-9a-f]{2}/gi,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(content)) ||
           obfuscationPatterns.some(pattern => pattern.test(content));
  }

  private isSuspiciousDomain(domain: string, baseDomain: string): boolean {
    // Check for typosquatting patterns
    const baseParts = baseDomain.split('.');
    const domainParts = domain.split('.');
    
    if (baseParts.length === domainParts.length) {
      const baseMain = baseParts[0];
      const domainMain = domainParts[0];
      
      // Check for character substitutions (e.g., paypa1.com vs paypal.com)
      if (baseMain.length === domainMain.length && baseMain !== domainMain) {
        let differences = 0;
        for (let i = 0; i < baseMain.length; i++) {
          if (baseMain[i] !== domainMain[i]) {
            differences++;
          }
        }
        // If only 1-2 characters differ, might be typosquatting
        if (differences <= 2) {
          return true;
        }
      }
    }

    return false;
  }

  private isSuspiciousFormAction(action: string): boolean {
    // Check for suspicious form actions
    const suspiciousPatterns = [
      /mailto:/i,
      /javascript:/i,
      /data:/i,
    ];
    return suspiciousPatterns.some(pattern => pattern.test(action));
  }

  private hasObfuscatedCode(scripts: WebsiteContentAnalysis['scripts']): boolean {
    // Check inline scripts for obfuscation
    // Note: external scripts are URLs, not content, so we only check inline scripts
    return scripts.suspiciousPatterns.length > 0 ||
           scripts.inline.some(script => this.isSuspiciousInlineScript(script));
  }

  private hasSuspiciousRedirects(scripts: WebsiteContentAnalysis['scripts'], $: cheerio.CheerioAPI): boolean {
    // Check scripts for redirects
    const redirectPatterns = [
      /window\.location\s*=/i,
      /location\.href\s*=/i,
      /location\.replace/i,
      /location\.assign/i,
    ];

    const allScripts = [...scripts.inline];
    return allScripts.some(script => redirectPatterns.some(pattern => pattern.test(script)));
  }

  private isSuspiciousRedirect(content: string): boolean {
    // Check meta refresh redirect
    const redirectPattern = /url\s*=\s*['"]?([^'"]+)['"]?/i;
    const match = content.match(redirectPattern);
    if (match) {
      const redirectUrl = match[1];
      // Check if redirect is to external domain
      return redirectUrl.startsWith('http') && !redirectUrl.startsWith('https://');
    }
    return false;
  }
}

