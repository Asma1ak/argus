import { nanoid } from 'nanoid';
import crypto from 'crypto';
import groqService from './groqService.js';
import prisma from '../config/database.js';
import { analysisCache } from './redisCacheService.js';
import logger from '../utils/logger.js';
import { metrics } from './metricsService.js';
import { AnalysisResult, Issue, IssueType, IssueSeverity } from '../types/index.js';

const SYSTEM_PROMPT = `You are Argus, an expert critical thinking analyst. Your task is to thoroughly analyze text for logical fallacies, cognitive biases, and manipulation tactics.

## DETECTION CATEGORIES

### 📌 FORMAL FALLACIES (Structure Errors)
- Affirming the consequent
- Denying the antecedent
- Undistributed middle
- Illicit major / Illicit minor
- Four-term fallacy
- Fallacy of exclusive premises
- Existential fallacy

### 📌 INFORMAL FALLACIES (Content & Language Errors)

#### 🔹 Relevance Fallacies
- Ad hominem (abusive, circumstantial, tu quoque)
- Genetic fallacy
- Guilt by association
- Poisoning the well
- Appeal to authority (weak/false authority)
- Appeal to popularity (bandwagon)
- Appeal to emotion (fear, pity, flattery, ridicule)
- Appeal to force (argumentum ad baculum)
- Appeal to consequences
- Straw man
- Red herring
- Whataboutism
- Appeal to tradition
- Appeal to novelty

#### 🔹 Weak Induction
- Hasty generalization
- Biased sample
- Anecdotal fallacy
- False cause (post hoc ergo propter hoc, cum hoc ergo propter hoc)
- Slippery slope
- Weak analogy
- False dilemma (false dichotomy)
- Cherry picking / suppressed evidence
- Texas sharpshooter fallacy
- Survivorship bias

#### 🔹 Presumption Fallacies
- Begging the question (circular reasoning)
- Loaded question
- Complex question
- No true Scotsman
- Special pleading
- Moving the goalposts

#### 🔹 Ambiguity Fallacies
- Equivocation
- Amphiboly
- Accent fallacy
- Composition fallacy
- Division fallacy

### 🧠 COGNITIVE BIASES (Systematic Thinking Errors)

#### 📊 Judgment & Decision Biases
- Confirmation bias
- Anchoring bias
- Availability heuristic
- Representativeness heuristic
- Base rate neglect
- Framing effect
- Loss aversion
- Sunk cost fallacy
- Status quo bias
- Endowment effect
- Risk compensation
- Zero-risk bias
- Omission bias

#### 👥 Social & Self Biases
- Fundamental attribution error
- Self-serving bias
- Actor–observer bias
- In-group bias
- Out-group homogeneity bias
- Halo effect
- Horn effect
- Just-world hypothesis
- False consensus effect
- Spotlight effect
- Illusion of transparency

#### 🧩 Memory Biases
- Hindsight bias
- Misinformation effect
- False memory
- Recency effect
- Primacy effect
- Peak–end rule
- Rosy retrospection
- Telescoping effect

#### 🎯 Probability & Pattern Biases
- Gambler's fallacy
- Hot-hand fallacy
- Clustering illusion
- Illusory correlation
- Apophenia
- Neglect of probability
- Law of small numbers

#### 🧠 Metacognitive Biases
- Dunning–Kruger effect
- Overconfidence bias
- Illusion of explanatory depth
- Bias blind spot
- Naive realism
- Curse of knowledge

#### 💰 Economic & Value Biases
- Hyperbolic discounting
- Present bias
- Time inconsistency
- Money illusion

### 🎭 MANIPULATION TACTICS (Influence & Control Methods)

#### 🗣️ Conversational / Debate Manipulation
- Gaslighting
- Straw man distortion
- Motte-and-bailey tactic
- Gish gallop
- Sealioning
- Loaded language
- Leading questions
- False balance framing
- Narrative framing
- Topic flooding

#### 🧲 Psychological Influence Tactics
- Love bombing
- Foot-in-the-door technique
- Door-in-the-face technique
- Lowball technique
- Reciprocity pressure
- Scarcity pressure
- Urgency pressure
- Authority signaling
- Social proof exploitation
- Commitment & consistency pressure

#### 🧩 Coercive / Control Tactics
- Fear appeals
- Shame induction
- Guilt tripping
- Emotional blackmail
- Triangulation
- Silent treatment
- Intermittent reinforcement
- Trauma bonding
- Dependency creation

#### 📢 Propaganda Techniques
- Bandwagon messaging
- Glittering generalities
- Name-calling
- Card stacking
- Transfer association
- Testimonial misuse
- Plain folks appeal
- Demonization
- Oversimplification

## ANALYSIS INSTRUCTIONS

**BE THOROUGH**: Analyze the text comprehensively and identify ALL instances of fallacies, biases, and manipulation tactics.

**GROUPING RULE**: If a single sentence or statement contains MULTIPLE issues, combine them into ONE entry with:
- List all issue names together (e.g., "Appeal to fear + False dichotomy")
- Use the highest severity among them
- Explain all issues in a combined explanation

For each issue/group found, provide:
1. **type**: "fallacy" | "bias" | "heuristic" | "manipulation" (use the primary/most severe type)
2. **name**: The specific name(s) - combine with " + " if multiple (e.g., "Ad hominem + Poisoning the well")
3. **severity**: "low" | "medium" | "high" (use highest if multiple issues)
4. **quote**: The exact text that demonstrates the issue(s)
5. **explanation**: Why this is problematic - explain ALL issues found in this quote
6. **suggestion**: How to think more critically about this (actionable advice)
7. **counterArgument**: A ready-to-use response that politely but firmly challenges the flawed reasoning (1-2 sentences, conversational tone)

## RESPONSE FORMAT

Respond ONLY in valid JSON:
{
  "summary": "A 2-3 sentence overall assessment of the text's logical quality",
  "score": <0-100 integer where 100 = perfectly logical, 0 = severely flawed>,
  "issues": [
    {
      "type": "fallacy|bias|heuristic|manipulation",
      "name": "Issue name(s) - use ' + ' to combine multiple",
      "severity": "low|medium|high",
      "quote": "The exact problematic text",
      "explanation": "Why this is problematic - cover all issues in this quote",
      "suggestion": "How to think critically about this",
      "counterArgument": "A polite but firm response to challenge this reasoning"
    }
  ]
}

## EXAMPLE OF GROUPING
If a statement like "Everyone knows only an idiot would disagree" contains both:
- Appeal to popularity ("Everyone knows")
- Ad hominem ("only an idiot")

Report as ONE issue:
{
  "type": "fallacy",
  "name": "Appeal to popularity + Ad hominem",
  "severity": "high",
  "quote": "Everyone knows only an idiot would disagree",
  "explanation": "This statement combines two fallacies: it appeals to popular opinion as proof ('everyone knows') while also attacking anyone who disagrees as unintelligent ('only an idiot'). Neither addresses the actual argument.",
  "suggestion": "Ask: What evidence supports this claim beyond popular belief? Would the argument still hold if phrased respectfully?",
  "counterArgument": "I'd prefer to focus on the evidence rather than what 'everyone' thinks. Could you share the specific data or reasoning that supports your position?"
}

## THOROUGHNESS REQUIREMENTS
- Identify EVERY fallacy, bias, heuristic, and manipulation tactic present
- Group multiple issues that appear in the SAME quote/sentence
- Only create separate entries for issues in DIFFERENT sentences
- Look for subtle issues, not just obvious ones
- Consider the overall framing and tone, not just individual statements

## SCORING GUIDE
- 90-100: Excellent reasoning, no significant issues
- 70-89: Good reasoning with minor issues (1-2 low severity)
- 50-69: Moderate issues that affect credibility (3-5 issues or 1-2 high severity)
- 30-49: Significant logical problems (5-8 issues or multiple high severity)
- 0-29: Severely flawed reasoning, multiple major issues (8+ issues)

Be thorough but fair. Only flag genuine issues with clear evidence from the text. Do not invent issues that aren't present.`;

// Supported languages
const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  ru: 'Russian',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  tr: 'Turkish',
  pl: 'Polish',
  vi: 'Vietnamese',
  th: 'Thai',
  id: 'Indonesian',
  auto: 'Auto-detect'
};

class AnalysisService {
  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return SUPPORTED_LANGUAGES;
  }

  /**
   * Generate a hash for text content (for duplicate detection)
   */
  private hashText(text: string, language: string): string {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
    return crypto.createHash('sha256').update(`${normalized}:${language}`).digest('hex');
  }

  /**
   * Check if we have a cached/recent analysis for this text
   */
  private async findExistingAnalysis(
    textHash: string,
    userId?: string
  ): Promise<(AnalysisResult & { id: string; shareId?: string; cached: boolean }) | null> {
    // Check Redis/memory cache first
    const cacheKey = `analysis:${textHash}`;
    const cached = await analysisCache.get<AnalysisResult & { id: string; shareId?: string }>(cacheKey);
    
    if (cached) {
      logger.debug(`Cache hit for analysis: ${textHash.slice(0, 8)}...`);
      return { ...cached, cached: true };
    }

    // Check database for recent identical analysis (within 24 hours)
    const recentAnalysis = await prisma.analysis.findFirst({
      where: {
        textHash,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        summary: true,
        score: true,
        issues: true,
        shareId: true,
        createdAt: true,
      },
    });

    if (recentAnalysis) {
      const result = {
        id: recentAnalysis.id,
        shareId: recentAnalysis.shareId || undefined,
        summary: recentAnalysis.summary,
        score: recentAnalysis.score,
        issues: JSON.parse(recentAnalysis.issues) as Issue[],
        analyzedAt: recentAnalysis.createdAt.toISOString(),
        metadata: this.calculateMetadata(JSON.parse(recentAnalysis.issues) as Issue[]),
        cached: true,
      };

      // Store in cache for faster future lookups
      await analysisCache.set(cacheKey, result);
      
      logger.info(`Found existing analysis for hash: ${textHash.slice(0, 8)}...`);
      return result;
    }

    return null;
  }

  /**
   * Analyze text for critical thinking issues
   */
  async analyzeText(
    text: string, 
    userId?: string,
    language: string = 'auto'
  ): Promise<AnalysisResult & { id: string; shareId?: string; language?: string; cached?: boolean }> {
    const startTime = Date.now();
    const textHash = this.hashText(text, language);
    
    logger.info(`Analyzing text (${text.length} chars) for user: ${userId || 'anonymous'}, language: ${language}`);

    // Check for existing analysis (cache or recent DB entry)
    const existing = await this.findExistingAnalysis(textHash, userId);
    if (existing) {
      // If user is logged in, create a reference to this analysis for their history
      if (userId) {
        // Update user's analysis count
        await prisma.user.update({
          where: { id: userId },
          data: { analysisCount: { increment: 1 } },
        });
      }
      
      return {
        ...existing,
        language,
      };
    }

    // Build language instruction
    let languageInstruction = '';
    if (language === 'auto') {
      languageInstruction = `
LANGUAGE INSTRUCTION:
- Detect the language of the input text
- Respond in the SAME language as the input text
- All fields (summary, explanation, suggestion, counterArgument) must be in the detected language
- Keep issue "type" and "severity" values in English (fallacy/bias/heuristic/manipulation, low/medium/high)
- Issue "name" should be in the detected language (e.g., "Ad hominem" → "Ataque personal" in Spanish)`;
    } else {
      const langName = SUPPORTED_LANGUAGES[language] || 'English';
      languageInstruction = `
LANGUAGE INSTRUCTION:
- Respond in ${langName} (${language})
- All fields (summary, explanation, suggestion, counterArgument) must be in ${langName}
- Keep issue "type" and "severity" values in English (fallacy/bias/heuristic/manipulation, low/medium/high)
- Issue "name" should be translated to ${langName}`;
    }

    const result = await groqService.complete(
      SYSTEM_PROMPT + languageInstruction,
      `Analyze this text for critical thinking issues:\n\n"${text}"`
    );

    const normalized = this.normalizeResult(result as { summary?: string; score?: number; issues?: unknown[] });
    const processingMs = Date.now() - startTime;

    // Save to database with text hash
    const analysis = await prisma.analysis.create({
      data: {
        userId,
        text,
        textLength: text.length,
        textHash,
        summary: normalized.summary,
        score: normalized.score,
        issues: JSON.stringify(normalized.issues),
        issueCount: normalized.issues.length,
        processingMs,
        language,
        shareId: nanoid(10),
      },
    });

    // Update user analysis count
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { analysisCount: { increment: 1 } },
      });
    }

    // Cache the result
    const cacheKey = `analysis:${textHash}`;
    const cacheResult = {
      ...normalized,
      id: analysis.id,
      shareId: analysis.shareId || undefined,
    };
    await analysisCache.set(cacheKey, cacheResult);

    logger.info(`Analysis completed: score=${normalized.score}, issues=${normalized.issues.length}, time=${processingMs}ms`);

    return {
      ...cacheResult,
      language,
      cached: false,
    };
  }

  /**
   * Get analysis by ID
   */
  async getById(id: string, userId?: string): Promise<(AnalysisResult & { id: string; shareId?: string; text: string }) | null> {
    // Check cache first
    const cacheKey = `analysis:id:${id}`;
    const cached = await analysisCache.get<AnalysisResult & { id: string; shareId?: string; text: string }>(cacheKey);
    if (cached) {
      return cached;
    }

    // Use select to only fetch needed fields
    const analysis = await prisma.analysis.findUnique({ 
      where: { id },
      select: {
        id: true,
        userId: true,
        text: true,
        summary: true,
        score: true,
        issues: true,
        shareId: true,
        isPublic: true,
        createdAt: true,
      },
    });
    
    if (!analysis) return null;
    
    // Check access
    if (!analysis.isPublic && analysis.userId !== userId) {
      return null;
    }

    const result = {
      id: analysis.id,
      shareId: analysis.shareId || undefined,
      text: analysis.text,
      summary: analysis.summary,
      score: analysis.score,
      issues: JSON.parse(analysis.issues) as Issue[],
      analyzedAt: analysis.createdAt.toISOString(),
      metadata: this.calculateMetadata(JSON.parse(analysis.issues) as Issue[]),
    };

    // Cache for future requests
    await analysisCache.set(cacheKey, result, 600); // 10 minutes in seconds

    return result;
  }

  /**
   * Get analysis by share ID (public access)
   */
  async getByShareId(shareId: string): Promise<(AnalysisResult & { id: string; text: string }) | null> {
    const analysis = await prisma.analysis.findUnique({ where: { shareId } });
    
    if (!analysis) return null;

    // Mark as public when accessed via share link
    if (!analysis.isPublic) {
      await prisma.analysis.update({
        where: { id: analysis.id },
        data: { isPublic: true },
      });
    }

    return {
      id: analysis.id,
      text: analysis.text,
      summary: analysis.summary,
      score: analysis.score,
      issues: JSON.parse(analysis.issues) as Issue[],
      analyzedAt: analysis.createdAt.toISOString(),
      metadata: this.calculateMetadata(JSON.parse(analysis.issues) as Issue[]),
    };
  }

  /**
   * Get user's analysis history
   */
  async getUserHistory(userId: string, limit = 20, offset = 0) {
    const analyses = await prisma.analysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        text: true,
        summary: true,
        score: true,
        issueCount: true,
        shareId: true,
        createdAt: true,
      },
    });

    const total = await prisma.analysis.count({ where: { userId } });

    return {
      analyses: analyses.map(a => ({
        ...a,
        textPreview: a.text.slice(0, 100) + (a.text.length > 100 ? '...' : ''),
      })),
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Delete analysis (atomic transaction)
   */
  async delete(id: string, userId: string): Promise<boolean> {
    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      const analysis = await tx.analysis.findUnique({ 
        where: { id },
        select: { id: true, userId: true },
      });
      
      if (!analysis || analysis.userId !== userId) {
        return false;
      }

      await tx.analysis.delete({ where: { id } });
      
      // Decrement user count
      await tx.user.update({
        where: { id: userId },
        data: { analysisCount: { decrement: 1 } },
      });

      return true;
    });

    // Invalidate cache after successful transaction
    if (result) {
      await analysisCache.delete(`analysis:id:${id}`);
    }

    return result;
  }

  // ================================
  // Helper Methods
  // ================================

  private normalizeResult(result: { summary?: string; score?: number; issues?: unknown[] }): Omit<AnalysisResult, 'id' | 'text'> {
    const issues = this.normalizeIssues(result.issues || []);
    
    return {
      summary: result.summary || 'Analysis complete.',
      score: this.normalizeScore(result.score),
      issues,
      analyzedAt: new Date().toISOString(),
      metadata: this.calculateMetadata(issues),
    };
  }

  private normalizeScore(score?: number): number {
    const num = parseInt(String(score), 10);
    if (isNaN(num)) return 50;
    return Math.max(0, Math.min(100, num));
  }

  private normalizeIssues(issues: unknown[]): Issue[] {
    if (!Array.isArray(issues)) return [];

    return issues.map((issue, index) => {
      const i = issue as Record<string, unknown>;
      return {
        id: index + 1,
        type: this.normalizeType(i.type as string),
        name: (i.name as string) || 'Unknown Issue',
        severity: this.normalizeSeverity(i.severity as string),
        quote: (i.quote as string) || '',
        explanation: (i.explanation as string) || '',
        suggestion: (i.suggestion as string) || '',
      };
    });
  }

  private normalizeType(type?: string): IssueType {
    const valid: IssueType[] = ['fallacy', 'bias', 'heuristic', 'manipulation'];
    const normalized = (type || '').toLowerCase() as IssueType;
    return valid.includes(normalized) ? normalized : 'fallacy';
  }

  private normalizeSeverity(severity?: string): IssueSeverity {
    const valid: IssueSeverity[] = ['low', 'medium', 'high'];
    const normalized = (severity || '').toLowerCase() as IssueSeverity;
    return valid.includes(normalized) ? normalized : 'medium';
  }

  private calculateMetadata(issues: Issue[]) {
    return {
      issueCount: issues.length,
      severityCounts: issues.reduce((acc, i) => {
        acc[i.severity] = (acc[i.severity] || 0) + 1;
        return acc;
      }, { low: 0, medium: 0, high: 0 } as Record<IssueSeverity, number>),
      typeCounts: issues.reduce((acc, i) => {
        acc[i.type] = (acc[i.type] || 0) + 1;
        return acc;
      }, {} as Record<IssueType, number>),
    };
  }
}

export default new AnalysisService();
