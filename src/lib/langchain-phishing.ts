import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { FetchWebsiteContentTool } from './tools/fetch-website-content';
import { normalizeUrl } from './gemini';

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL_NAME || 'gemini-2.0-flash-exp';

if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not set in environment variables');
}

export interface PhishingCheckResult {
  isPhishing: boolean;
  hasWarning?: boolean;
  warningType?: string[];
  warningSeverity?: 'low' | 'medium' | 'high';
  warningReason?: string;
  confidence?: number;
  reason?: string;
  toolUsed?: boolean;
}

/**
 * LangChain-based phishing detection with tool calling capability
 */
export async function checkPhishingUrlWithLangChain(url: string): Promise<PhishingCheckResult> {
  try {
    console.log('[langchain-phishing] Starting phishing check for URL:', url);
    const normalizedUrl = normalizeUrl(url);
    console.log('[langchain-phishing] Using model:', modelName);

    // Initialize the model
    const model = new ChatGoogleGenerativeAI({
      modelName,
      apiKey,
      temperature: 0.1, // Lower temperature for more consistent results
    });

    // Create the tool
    const fetchTool = new FetchWebsiteContentTool();

    // Bind tools to the model - cast to any to handle type compatibility
    const modelWithTools = model.bindTools([fetchTool as any]);

    // System prompt for phishing and warning detection
    const systemPrompt = `You are an expert cybersecurity analyst specializing in website risk assessment. 
Your task is to analyze URLs and determine:
1. If they are phishing sites (should be blocked)
2. If they have warnings (risky but not phishing - should warn user)

PHISHING DETECTION - Consider:
- Domain name suspicious patterns (typosquatting, lookalike domains)
- URL structure and path anomalies
- Known phishing indicators
- SSL certificate validity (if applicable)
- Domain age and reputation

WARNING DETECTION - Check for these risk categories (even if not phishing):
- PIRACY: Sites hosting pirated content, illegal downloads, torrent sites
- SCAMMING: Scam websites, fraudulent services, fake reviews, deceptive practices
- RISKY_LINKS: Sites with suspicious redirects, suspicious external links, link farms
- SCAM_PRODUCTS: Sites selling fake products, counterfeit goods, scam marketplaces
- RISKY_FILES: Sites distributing potentially malicious files, suspicious downloads

If you are not fully confident about your assessment based on the URL alone, use the fetchWebsiteContent tool to examine the actual website content, including:
- JavaScript code (especially obfuscated or suspicious scripts)
- HTML forms (especially hidden forms or suspicious form actions)
- Links and redirects
- Meta tags and page structure
- Content indicating piracy, scams, or risky behavior

After analysis, respond with a JSON object in this exact format:
{
  "isPhishing": true or false,
  "hasWarning": true or false (true if site has risks but is not phishing),
  "warningType": ["piracy", "scamming", "risky_links", "scam_products", "risky_files"] (array of applicable warning types, empty if no warnings),
  "warningSeverity": "low" or "medium" or "high" (only if hasWarning is true),
  "confidence": 0.0 to 1.0 (where 1.0 is completely certain),
  "reason": "Brief explanation of why this is or isn't phishing, or what warnings apply"
}

If your confidence is below 0.8, you should use the fetchWebsiteContent tool to gather more information before making a final decision.`;

    // Initial message - use BaseMessage[] type for messages array
    const messages: BaseMessage[] = [
      new HumanMessage(`${systemPrompt}\n\nURL to analyze: ${normalizedUrl}`),
    ];

    let toolUsed = false;
    let maxIterations = 5; // Prevent infinite loops
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      console.log(`[langchain-phishing] Iteration ${iteration}`);

      // Invoke the model
      let response;
      try {
        // LangChain models accept BaseMessage[] - use type assertion for compatibility
        response = await modelWithTools.invoke(messages as any);
        if (!response) {
          throw new Error('Empty response from model');
        }
      } catch (invokeError) {
        console.error('[langchain-phishing] Error invoking model:', invokeError);
        throw invokeError; // Re-throw to be caught by outer try-catch
      }
      
      // Safely extract content from response
      let responseContent = '';
      if (response && response.content) {
        if (typeof response.content === 'string') {
          responseContent = response.content;
        } else if (Array.isArray(response.content) && response.content.length > 0) {
          responseContent = response.content
            .map(c => {
              if (typeof c === 'string') return c;
              if (c && typeof c === 'object') {
                // Handle content blocks (e.g., from Gemini)
                if ('text' in c && typeof (c as any).text === 'string') return (c as any).text;
                if ('type' in c && c.type === 'text' && 'text' in c && typeof (c as any).text === 'string') {
                  return (c as any).text;
                }
                return JSON.stringify(c);
              }
              return String(c);
            })
            .join(' ');
        } else {
          responseContent = String(response.content || '');
        }
      } else {
        // Fallback if content is missing
        responseContent = JSON.stringify(response) || 'No response content';
      }
      
      console.log('[langchain-phishing] Model response:', {
        content: responseContent.substring(0, 200),
        toolCalls: (response.tool_calls?.length || 0),
        hasContent: !!response.content,
        contentType: typeof response.content,
      });

      // Add AI response to messages - convert to AIMessage if needed
      if (response instanceof AIMessage) {
        messages.push(response);
      } else {
        // Convert response chunk to AIMessage
        const aiMessage = new AIMessage({
          content: response.content,
          tool_calls: response.tool_calls,
        });
        messages.push(aiMessage);
      }

      // Check if model wants to call a tool
      // Handle both response.tool_calls and response.additional_kwargs.tool_calls
      let toolCalls: any[] = [];
      if (response.tool_calls && Array.isArray(response.tool_calls)) {
        toolCalls = response.tool_calls;
      } else if ((response as any).additional_kwargs?.tool_calls && Array.isArray((response as any).additional_kwargs.tool_calls)) {
        toolCalls = (response as any).additional_kwargs.tool_calls;
      }
      
      if (toolCalls.length > 0) {
        toolUsed = true;
        console.log('[langchain-phishing] Tool calls detected:', toolCalls.length);

        // Execute tool calls
        for (const toolCall of toolCalls) {
          if (!toolCall) continue; // Skip null/undefined tool calls
          
          try {
            const toolName = toolCall.name || toolCall.function?.name;
            let toolArgs = {};
            
            if (toolCall.args) {
              toolArgs = toolCall.args;
            } else if (toolCall.function?.arguments) {
              try {
                toolArgs = typeof toolCall.function.arguments === 'string' 
                  ? JSON.parse(toolCall.function.arguments) 
                  : toolCall.function.arguments;
              } catch (parseError) {
                console.warn('[langchain-phishing] Failed to parse tool arguments:', parseError);
                toolArgs = {};
              }
            }
            
            const toolCallId = toolCall.id || toolCall.function?.name || `call_${Date.now()}_${Math.random()}`;
            
            if (toolName === 'fetchWebsiteContent') {
              const toolInput = typeof toolArgs === 'string' ? JSON.parse(toolArgs) : toolArgs;
              console.log('[langchain-phishing] Calling fetchWebsiteContent tool with URL:', toolInput.url || normalizedUrl);
              
              // Use provided URL or fallback to normalized URL
              const urlToFetch = toolInput.url || normalizedUrl;
              const toolResult = await fetchTool.invoke({ url: urlToFetch });
              console.log('[langchain-phishing] Tool result length:', toolResult.length);

              // Add tool result to messages
              messages.push(
                new ToolMessage({
                  content: toolResult,
                  tool_call_id: toolCallId,
                })
              );
            }
          } catch (toolError) {
            console.error('[langchain-phishing] Error processing tool call:', toolError);
            // Continue with other tool calls even if one fails
          }
        }

        // Continue the conversation with tool results
        continue;
      }

      // No tool calls, extract final result
      const content = responseContent || '';
      if (!content) {
        console.warn('[langchain-phishing] Empty response content, continuing to next iteration');
        iteration++; // Prevent infinite loop
        continue;
      }
      console.log('[langchain-phishing] Final response:', content.substring(0, 500));

      // Try to extract JSON from response
      let jsonText = content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }

      try {
        const parsed = JSON.parse(jsonText);
        const result: PhishingCheckResult = {
          isPhishing: Boolean(parsed.isPhishing),
          hasWarning: parsed.hasWarning ? Boolean(parsed.hasWarning) : undefined,
          warningType: parsed.warningType ? (Array.isArray(parsed.warningType) ? parsed.warningType : [parsed.warningType]) : undefined,
          warningSeverity: parsed.warningSeverity && ['low', 'medium', 'high'].includes(parsed.warningSeverity) 
            ? parsed.warningSeverity as 'low' | 'medium' | 'high' 
            : undefined,
          warningReason: parsed.warningReason || undefined,
          confidence: parsed.confidence ? parseFloat(parsed.confidence) : undefined,
          reason: parsed.reason || undefined,
          toolUsed,
        };

        console.log('[langchain-phishing] Parsed result:', result);
        return result;
      } catch (parseError) {
        console.warn('[langchain-phishing] Failed to parse JSON, attempting to extract from text');
        
        // Fallback: try to extract information from text response
        const isPhishingMatch = content.match(/isPhishing["\s:]*(\w+)/i);
        const hasWarningMatch = content.match(/hasWarning["\s:]*(\w+)/i);
        const warningTypeMatch = content.match(/warningType["\s:]*\[([^\]]+)\]/i) || content.match(/warningType["\s:]*["']([^"']+)["']/i);
        const warningSeverityMatch = content.match(/warningSeverity["\s:]*["']?(\w+)["']?/i);
        const confidenceMatch = content.match(/confidence["\s:]*([0-9.]+)/i);
        const reasonMatch = content.match(/reason["\s:]*["']([^"']+)["']/i);

        return {
          isPhishing: isPhishingMatch ? isPhishingMatch[1].toLowerCase() === 'true' : false,
          hasWarning: hasWarningMatch ? hasWarningMatch[1].toLowerCase() === 'true' : undefined,
          warningType: warningTypeMatch ? warningTypeMatch[1].split(',').map(t => t.trim().replace(/["']/g, '')) : undefined,
          warningSeverity: warningSeverityMatch && ['low', 'medium', 'high'].includes(warningSeverityMatch[1].toLowerCase())
            ? warningSeverityMatch[1].toLowerCase() as 'low' | 'medium' | 'high'
            : undefined,
          confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : undefined,
          reason: reasonMatch ? reasonMatch[1] : content.substring(0, 500),
          toolUsed,
        };
      }
    }

    // Max iterations reached
    console.warn('[langchain-phishing] Max iterations reached, returning default result');
    return {
      isPhishing: false,
      confidence: 0.5,
      reason: 'Unable to determine phishing status after multiple iterations',
      toolUsed,
    };
  } catch (error) {
    console.error('[langchain-phishing] Error checking URL:', error);
    if (error instanceof Error) {
      console.error('[langchain-phishing] Error message:', error.message);
      console.error('[langchain-phishing] Error stack:', error.stack);
    }
    // Fail open - if we can't check, allow the URL
    return {
      isPhishing: false,
      reason: 'Unable to verify URL due to API error',
      toolUsed: false,
    };
  }
}

