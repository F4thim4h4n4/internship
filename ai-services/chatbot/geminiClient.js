import { GoogleGenAI } from '@google/genai';
import { config } from '../shared/configs/config.js';
import { logger } from '../shared/utils/logger.js';
import { SYSTEM_INSTRUCTION, RESPONSE_SCHEMA, formatGroundedPrompt } from './prompts/templates.js';

// Initialize the Google Gen AI client lazily
let aiInstance = null;
let activePromptCache = null;

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

// Static representation of municipal approved documents to cache as prefix context
const MUNICIPAL_DOCS_CONTEXT = `Kottakkal Municipality Official Documents:
- kb_001: Kottakkal Municipality collects organic waste (food and wet waste) on Mondays and Wednesdays. Inorganic/recyclable waste (plastic, paper, glass) is collected on Fridays. Hazardous waste is collected on the first Saturday of every month. Public street bins are cleared daily starting at 6:00 AM.
- kb_002: For building permit approval in Kottakkal, citizens must submit: 1. Completed application form. 2. Property deed / possession certificate. 3. Structural plans signed by a registered engineer. 4. Land tax receipts for the current year. Applications are processed within 30 days.
- kb_003: Property tax in Kottakkal can be paid online via the Sanchaya portal (sanchaya.lsgkerala.gov.in) or physically at the municipal office counter. The annual payment deadline to avoid a 1% monthly penalty is September 30th.
- kb_004: The Kottakkal Municipal Office is located at Main Road, Kottakkal. Working hours are Monday to Saturday, 10:00 AM to 5:00 PM (closed on Sundays and public holidays). Key contacts: Chairman: 0483-2742031, Secretary: 0483-2742033, Health Section: 0483-2742032.`;

/**
 * Lazy explicit caching creator/fetcher for system prompts and municipal files
 */
const getOrCreatePromptCache = async (ai, correlationId) => {
  if (activePromptCache) {
    return activePromptCache;
  }
  try {
    logger.info('Creating new Explicit Prompt Cache for chatbot...', { correlationId });
    const cache = await ai.caches.create({
      model: config.geminiModel,
      config: {
        contents: [MUNICIPAL_DOCS_CONTEXT],
        systemInstruction: SYSTEM_INSTRUCTION,
        ttl: "300s" // 5 mins TTL
      }
    });
    activePromptCache = cache;
    logger.info(`Prompt cache created successfully: ${cache.name}`, { correlationId, cacheName: cache.name });
    return activePromptCache;
  } catch (error) {
    logger.warn(`Failed to create explicit prompt cache: ${error.message}. Proceeding without caching.`, { correlationId });
    return null;
  }
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

    logger.info('Simulated Gemini API call successful (MOCK mode) with prompt caching', {
      correlationId,
      event: 'gemini_response_mock',
      aiModel: 'mock-gemini-model',
      durationMs,
      promptTokens: 20, // Compressed tokens
      candidatesTokens: 40,
      totalTokens: 60,
      retrievalKbIds: contextChunks.map(c => c.sourceId),
      cacheHit: true
    });

    return {
      success: true,
      data: parsedResult,
      meta: {
        model: 'mock-gemini-model',
        durationMs,
        tokens: { prompt: 20, completion: 40, total: 60 },
        retrievalKbIds: contextChunks.map(c => c.sourceId),
        mock: true,
        cacheHit: true
      }
    };
  }

  try {
    const ai = getAiInstance();
    const formattedPrompt = formatGroundedPrompt(query, contextChunks);

    // Try to retrieve or create the cache (explicit caching of static guidelines)
    let cache = null;
    if (ai) {
      cache = await getOrCreatePromptCache(ai, correlationId);
    }

    const callApi = async () => {
      const apiConfig = {
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
      };

      if (cache) {
        // Bind to created prompt cache and omit guidelines/system instructions from body parameter payload
        apiConfig.cachedContent = cache.name;
      } else {
        // Standard parameters fallback
        apiConfig.systemInstruction = SYSTEM_INSTRUCTION;
      }

      return await ai.models.generateContent({
        model: config.geminiModel,
        contents: formattedPrompt,
        config: apiConfig
      });
    };

    // Run the API call with up to 3 retries (total 4 attempts)
    let response;
    try {
      response = await retryWithBackoff(callApi, 3, 1000, correlationId);
    } catch (apiErr) {
      // Re-create cache if API throws cache expired / not found error
      if (cache && (apiErr.message.includes('expired') || apiErr.message.includes('not found') || apiErr.message.includes('Invalid argument'))) {
        logger.warn('Prompt cache expired or invalid. Re-creating and retrying query...', { correlationId });
        activePromptCache = null; // force recreation
        cache = await getOrCreatePromptCache(ai, correlationId);
        response = await retryWithBackoff(callApi, 3, 1000, correlationId);
      } else {
        throw apiErr;
      }
    }

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
      if (!parsedResult.sourcesUsed || parsedResult.sourcesUsed.length === 0) {
        verificationPassed = false;
        verificationErrorReason = 'Response claimed to be grounded but cited no sources.';
      } else {
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

      // Override response with safe fallback values
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
    const cachedPromptCharacters = usageMetadata.cachedContentCharactersCount || 0;

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
      groundingVerified: verificationPassed,
      cacheHit: cachedPromptCharacters > 0
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
          total: totalTokens,
          cachedCharacters: cachedPromptCharacters
        },
        retrievalKbIds: contextChunks.map(c => c.sourceId),
        groundingVerified: verificationPassed,
        cacheHit: cachedPromptCharacters > 0
      }
    };

  } catch (error) {
    const endTime = Date.now();
    const durationMs = endTime - startTime;

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
