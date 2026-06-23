import { GoogleGenAI } from '@google/genai';
import { config } from '../shared/configs/config.js';
import { logger } from '../shared/utils/logger.js';
import { SYSTEM_INSTRUCTION, RESPONSE_SCHEMA, formatGroundedPrompt } from './prompts/templates.js';

// Initialize the Google Gen AI client lazily
let aiInstance = null;

const getAiInstance = () => {
  if (!aiInstance) {
    if (!config.geminiApiKey) {
      if (process.env.NODE_ENV === 'test' || process.env.MOCK_GEMINI === 'true') {
        logger.warn('GEMINI_API_KEY is not set. Running Gemini Client in MOCK mode.');
        return null;
      }
      throw new Error('GEMINI_API_KEY environment variable is missing. Cannot initialize Gemini Client.');
    }
    aiInstance = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return aiInstance;
};

/**
 * Retries a promise-returning function with exponential backoff
 */
const retryWithBackoff = async (fn, retries = 3, delay = 1000, correlationId = '') => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    logger.warn(`Gemini API call failed. Retries remaining: ${retries}. Retrying in ${delay}ms...`, {
      correlationId,
      errorMessage: error.message || error
    });
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2, correlationId);
  }
};

/**
 * Invokes Gemini with grounding context, handles errors, retries, and logs audits
 */
export const generateGroundedResponse = async (query, contextChunks, correlationId) => {
  const startTime = Date.now();
  logger.info('Invoking Gemini API...', { correlationId, model: config.geminiModel });

  const validSourceIds = contextChunks.map(c => c.sourceId);

  // Handle Mock mode if in test env and no API key is provided
  if (!config.geminiApiKey && (process.env.NODE_ENV === 'test' || process.env.MOCK_GEMINI === 'true')) {
    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const hasContext = contextChunks && contextChunks.length > 0;
    
    let parsedResult = {
      response: '',
      grounded: false,
      sourcesUsed: [],
      escalateRequired: true
    };

    const isMalayalam = /[\u0D00-\u0D7F]/.test(query);

    // Mock Prompt Injection Detection
    if (query.toLowerCase().includes('ignore rules') || query.toLowerCase().includes('bomb') || query.toLowerCase().includes('override')) {
      parsedResult = {
        response: "Access Denied. I can only assist with official municipal services.",
        grounded: false,
        sourcesUsed: [],
        escalateRequired: false
      };
    } else if (query.toLowerCase().includes('sort') || query.toLowerCase().includes('javascript') || query.toLowerCase().includes('france')) {
      // Mock Fallback trigger for out of context
      parsedResult = {
        response: isMalayalam 
          ? "ക്ഷമിക്കണം, എനിക്ക് ആ വിഷയത്തെക്കുറിച്ചുള്ള വിവരങ്ങൾ എന്റെ ഡാറ്റാബേസിൽ ലഭ്യമല്ല. നിങ്ങൾക്ക് ഒരു പരാതി രജിസ്റ്റർ ചെയ്യണോ അതോ ഒരു മുൻസിപ്പൽ ഉദ്യോഗസ്ഥനിലേക്ക് കൈമാറണോ?"
          : "I am sorry, but I do not have official municipal information regarding that topic in my database. Would you like me to register a complaint/ticket, or escalate this to a municipal officer?",
        grounded: false,
        sourcesUsed: [],
        escalateRequired: true
      };
    } else if (hasContext) {
      // Mock Grounded response
      parsedResult = {
        response: `[MOCK GEMINI RESPONSE] Grounded in knowledge chunks [${validSourceIds.join(', ')}].\n\nBased on municipal records: ${contextChunks[0].content}`,
        grounded: true,
        sourcesUsed: [contextChunks[0].sourceId],
        escalateRequired: false
      };
    } else {
      parsedResult = {
        response: isMalayalam 
          ? "ക്ഷമിക്കണം, എനിക്ക് ആ വിഷയത്തെക്കുറിച്ചുള്ള വിവരങ്ങൾ എന്റെ ഡാറ്റാബേസിൽ ലഭ്യമല്ല. നിങ്ങൾക്ക് ഒരു പരാതി രജിസ്റ്റർ ചെയ്യണോ അതോ ഒരു മുൻസിപ്പൽ ഉദ്യോഗസ്ഥനിലേക്ക് കൈമാറണോ?"
          : "I am sorry, but I do not have official municipal information regarding that topic in my database. Would you like me to register a complaint/ticket, or escalate this to a municipal officer?",
        grounded: false,
        sourcesUsed: [],
        escalateRequired: true
      };
    }

    // Simulate grounding validation check in Mock Mode
    if (parsedResult.grounded && parsedResult.sourcesUsed.some(id => !validSourceIds.includes(id))) {
      logger.warn('Mock Grounding Verification Failed: Hallucination detected in mock source IDs.', { correlationId });
      parsedResult = {
        response: "I am sorry, but I do not have official municipal information regarding that topic in my database. Would you like me to register a complaint/ticket, or escalate this to a municipal officer?",
        grounded: false,
        sourcesUsed: [],
        escalateRequired: true
      };
    }

    logger.info('Simulated Gemini API call successful (MOCK mode)', {
      correlationId,
      event: 'gemini_response_mock',
      aiModel: 'mock-gemini-model',
      durationMs,
      promptTokens: 50,
      candidatesTokens: 40,
      totalTokens: 90,
      retrievalKbIds: contextChunks.map(c => c.sourceId)
    });

    return {
      success: true,
      data: parsedResult,
      meta: {
        model: 'mock-gemini-model',
        durationMs,
        tokens: { prompt: 50, completion: 40, total: 90 },
        retrievalKbIds: contextChunks.map(c => c.sourceId),
        mock: true
      }
    };
  }

  try {
    const ai = getAiInstance();
    const formattedPrompt = formatGroundedPrompt(query, contextChunks);

    const callApi = async () => {
      return await ai.models.generateContent({
        model: config.geminiModel,
        contents: formattedPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.1, // low temperature to ensure strict factuality
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        }
      });
    };

    // Run the API call with up to 3 retries (total 4 attempts)
    const response = await retryWithBackoff(callApi, 3, 1000, correlationId);
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    const responseText = response.text || '';
    
    // Parse the structured JSON response
    let parsedResult;
    try {
      parsedResult = JSON.parse(responseText);
    } catch {
      logger.error('Failed to parse Gemini response as JSON. Raw text: ' + responseText, { correlationId });
      throw new Error('Gemini did not return structured JSON as requested.');
    }

    // --- GROUNDING VERIFICATION POST-PROCESSOR ---
    let verificationPassed = true;
    let verificationErrorReason = '';

    if (parsedResult.grounded === true) {
      // 1. Ensure sourcesUsed is not empty if grounded is true
      if (!parsedResult.sourcesUsed || parsedResult.sourcesUsed.length === 0) {
        verificationPassed = false;
        verificationErrorReason = 'Response claimed to be grounded but cited no sources.';
      } else {
        // 2. Ensure all cited sources actually exist in contextChunks
        for (const citedId of parsedResult.sourcesUsed) {
          if (!validSourceIds.includes(citedId)) {
            verificationPassed = false;
            verificationErrorReason = `Hallucinated source ID cited: ${citedId}`;
            break;
          }
        }
      }
    }

    if (!verificationPassed) {
      logger.warn(`Grounding Verification Failed: ${verificationErrorReason}`, {
        correlationId,
        event: 'grounding_verification_failure',
        citedSources: parsedResult.sourcesUsed,
        validSources: validSourceIds
      });

      // Override the response with safe fallback values to prevent hallucination leakage
      const isMalayalam = /[\u0D00-\u0D7F]/.test(query);
      parsedResult = {
        response: isMalayalam 
          ? "ക്ഷമിക്കണം, എനിക്ക് ആ വിഷയത്തെക്കുറിച്ചുള്ള വിവരങ്ങൾ എന്റെ ഡാറ്റാബേസിൽ ലഭ്യമല്ല. നിങ്ങൾക്ക് ഒരു പരാതി രജിസ്റ്റർ ചെയ്യണോ അതോ ഒരു മുൻസിപ്പൽ ഉദ്യോഗസ്ഥനിലേക്ക് കൈമാറണോ?"
          : "I am sorry, but I do not have official municipal information regarding that topic in my database. Would you like me to register a complaint/ticket, or escalate this to a municipal officer?",
        grounded: false,
        sourcesUsed: [],
        escalateRequired: true
      };
    }

    // Extract metadata/token usage if available from the SDK response
    const usageMetadata = response.usageMetadata || {};
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const candidatesTokens = usageMetadata.candidatesTokenCount || 0;
    const totalTokens = usageMetadata.totalTokenCount || 0;

    // Log AI Audit Log (corresponds to ai_audit_logs collection schema)
    logger.info('Gemini API call successful', {
      correlationId,
      event: 'gemini_response',
      aiModel: config.geminiModel,
      durationMs,
      promptTokens,
      candidatesTokens,
      totalTokens,
      retrievalKbIds: contextChunks.map(c => c.sourceId),
      groundingVerified: verificationPassed
    });

    return {
      success: true,
      data: parsedResult,
      meta: {
        model: config.geminiModel,
        durationMs,
        tokens: {
          prompt: promptTokens,
          completion: candidatesTokens,
          total: totalTokens
        },
        retrievalKbIds: contextChunks.map(c => c.sourceId),
        groundingVerified: verificationPassed
      }
    };

  } catch (error) {
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    // Log AI Error Log (corresponds to ai_errors collection schema)
    logger.error('Gemini API call failed', {
      correlationId,
      event: 'gemini_error',
      errorStage: 'gemini_call',
      errorMessage: error.message || error,
      stack: error.stack,
      durationMs
    });

    throw error;
  }
};
