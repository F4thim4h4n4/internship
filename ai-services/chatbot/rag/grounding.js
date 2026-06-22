import { logger } from '../../shared/utils/logger.js';

// Mock database simulating Atlas Vector Search collection 'knowledge_base'
const mockKnowledgeBase = [
  {
    id: 'kb_001',
    content: 'Kottakkal Municipality collects organic waste (food and wet waste) on Mondays and Wednesdays. Inorganic/recyclable waste (plastic, paper, glass) is collected on Fridays. Hazardous waste is collected on the first Saturday of every month. Public street bins are cleared daily starting at 6:00 AM.',
    retrieval_allowed: true,
    visibility: 'public'
  },
  {
    id: 'kb_002',
    content: 'For building permit approval in Kottakkal, citizens must submit: 1. Completed application form. 2. Property deed / possession certificate. 3. Structural plans signed by a registered engineer. 4. Land tax receipts for the current year. Applications are processed within 30 days.',
    retrieval_allowed: true,
    visibility: 'public'
  },
  {
    id: 'kb_003',
    content: 'Property tax in Kottakkal can be paid online via the Sanchaya portal (sanchaya.lsgkerala.gov.in) or physically at the municipal office counter. The annual payment deadline to avoid a 1% monthly penalty is September 30th.',
    retrieval_allowed: true,
    visibility: 'public'
  },
  {
    id: 'kb_004',
    content: 'The Kottakkal Municipal Office is located at Main Road, Kottakkal. Working hours are Monday to Saturday, 10:00 AM to 5:00 PM (closed on Sundays and public holidays). Key contacts: Chairman: 0483-2742031, Secretary: 0483-2742033, Health Section: 0483-2742032.',
    retrieval_allowed: true,
    visibility: 'public'
  }
];

export const groundingMiddleware = (req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || req.body.correlation_id || 'no-correlation-id';
  const query = req.body.message || req.body.query || '';
  
  logger.info('Running RAG grounding middleware...', { correlationId, query });

  // 1. Parameter Validation
  const retrievalAllowed = req.body.retrieval_allowed !== false; // Default to true
  const visibility = req.body.visibility || 'public';

  if (!retrievalAllowed) {
    logger.warn('Retrieval is explicitly disallowed for this request.', { correlationId });
    req.ragContext = [];
    return next();
  }

  // 2. Perform Mock Vector Search (Keyword Matching)
  const normalizedQuery = query.toLowerCase();
  const contextChunks = [];

  mockKnowledgeBase.forEach(item => {
    if (item.visibility === visibility && item.retrieval_allowed) {
      // Simulate keyword matching
      let isMatch = false;
      if (normalizedQuery.includes('trash') || normalizedQuery.includes('waste') || normalizedQuery.includes('garbage')) {
        if (item.id === 'kb_001') isMatch = true;
      }
      if (normalizedQuery.includes('building') || normalizedQuery.includes('permit') || normalizedQuery.includes('construction') || normalizedQuery.includes('engineer')) {
        if (item.id === 'kb_002') isMatch = true;
      }
      if (normalizedQuery.includes('tax') || normalizedQuery.includes('property') || normalizedQuery.includes('sanchaya') || normalizedQuery.includes('penalty')) {
        if (item.id === 'kb_003') isMatch = true;
      }
      if (normalizedQuery.includes('contact') || normalizedQuery.includes('office') || normalizedQuery.includes('phone') || normalizedQuery.includes('chairman') || normalizedQuery.includes('secretary') || normalizedQuery.includes('hour')) {
        if (item.id === 'kb_004') isMatch = true;
      }

      if (isMatch) {
        contextChunks.push({
          sourceId: item.id,
          content: item.content
        });
      }
    }
  });

  logger.info(`RAG grounding complete. Found ${contextChunks.length} matching knowledge chunks.`, { 
    correlationId, 
    matchedSourceIds: contextChunks.map(c => c.sourceId) 
  });

  // Attach grounding results to the request object
  req.ragContext = contextChunks;
  next();
};
