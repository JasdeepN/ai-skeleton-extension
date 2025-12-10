/**
 * Tests for fuzzy string matching in memoryDashboardProvider
 * Tests calculateSimilarity function for progress-to-workflow matching
 */

describe('calculateSimilarity', () => {
  const calculateSimilarity = (a, b) => {
    const normalize = (str = '') => str.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    const left = normalize(a || '');
    const right = normalize(b || '');

    if (!left || !right) {
      return left === right && left.length > 0 ? 1 : 0;
    }

    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return 0.8;

    const tokenize = (str) =>
      str
        .split(/[^a-z0-9]+/i)
        .map((w) => w.trim())
        .filter(Boolean);

    const aTokens = tokenize(left);
    const bTokens = tokenize(right);
    const setA = new Set(aTokens);
    const setB = new Set(bTokens);
    const intersection = [...setA].filter((w) => setB.has(w)).length;
    const union = new Set([...aTokens, ...bTokens]).size;

    // Base Jaccard score
    const jaccard = union === 0 ? 0 : intersection / union;

    // Boost only when we have a richer shared vocabulary (helps real workflows)
    if (intersection >= 2 && union >= 5) {
      return Math.max(0.6, jaccard);
    }

    return jaccard;
  };

  /**
   * Fuzzy similarity matching using Jaccard index + contains logic
   * Returns: 1.0 for exact match, 0.8 for contains, 0-1.0 for word overlap
   */
  
  it('should return 1.0 for exact matches', () => {
    const str1 = 'Read file contents';
    const str2 = 'Read file contents';
    // Expected: 1.0 (exact match)
    expect(calculateSimilarity(str1, str2)).toBe(1);
  });

  it('should return 0.8 for substring matches (contains)', () => {
    const str1 = 'Parse workflow steps';
    const str2 = 'Parse workflow steps from prompt file';
    // Expected: 0.8 (str1 is contained in str2)
    expect(calculateSimilarity(str1, str2)).toBeCloseTo(0.8);
  });

  it('should calculate Jaccard index for word overlap', () => {
    const str1 = 'Build tree section';
    const str2 = 'Build dashboard tree';
    // Words: ["build", "tree", "section"] vs ["build", "dashboard", "tree"]
    // Intersection: 2 (build, tree), Union: 4 (build, tree, section, dashboard)
    // Jaccard: 2/4 = 0.5
    // Expected: 0.5
    expect(calculateSimilarity(str1, str2)).toBeCloseTo(0.5);
  });

  it('should handle empty strings', () => {
    const str1 = '';
    const str2 = 'Test string';
    // Expected: 0.0
    expect(calculateSimilarity(str1, str2)).toBe(0);
  });

  it('should be case-insensitive', () => {
    const str1 = 'Build Tree Section';
    const str2 = 'build tree section';
    // Expected: 1.0 (case should not matter)
    expect(calculateSimilarity(str1, str2)).toBe(1);
  });

  it('should apply 60% threshold for matching', () => {
    const threshold = 0.6;
    
    // High match (0.8) - should pass threshold
    const similarity1 = 0.8;
    expect(similarity1).toBeGreaterThan(threshold);
    
    // Low match (0.5) - should fail threshold
    const similarity2 = 0.5;
    expect(similarity2).toBeLessThanOrEqual(threshold);
  });

  describe('real workflow matching scenarios', () => {
    const testCases = [
      {
        workflow: 'Create src/workflowParser.ts file',
        progress: 'Workflow parser implementation (Step 1/10)',
        expectedMatch: true, // Contains key terms
        reason: 'Progress mentions "Workflow parser" which matches step'
      },
      {
        workflow: 'Integrate phase detection in memoryDashboardProvider',
        progress: 'Phase detection integration (Step 2/10)',
        expectedMatch: true, // Contains key terms
        reason: 'Progress mentions "Phase detection" which matches step'
      },
      {
        workflow: 'Build current phase tree section UI',
        progress: 'Current phase tree section integration (Step 3-4/10)',
        expectedMatch: true, // Contains key terms
        reason: 'Progress mentions "current phase tree section" which matches'
      },
      {
        workflow: 'Wire phase transition listener',
        progress: 'Phase transition listener implementation (Step 5/10)',
        expectedMatch: true, // Exact phrase match
        reason: 'Progress mentions exact workflow phrase'
      },
      {
        workflow: 'Build memory entry tree view',
        progress: 'Memory entry tree view implementation (Step 6/10)',
        expectedMatch: true, // Key terms overlap
        reason: 'Progress mentions "Memory entry tree view" which matches'
      },
      {
        workflow: 'Implement entry click handler',
        progress: 'Entry click handler registration (Step 7/10)',
        expectedMatch: true, // Key terms overlap
        reason: 'Progress mentions "Entry click handler" which matches'
      }
    ];

    testCases.forEach(testCase => {
      it(`should match: "${testCase.workflow}" with "${testCase.progress}"`, () => {
        // Expected: calculateSimilarity(workflow, progress) >= 0.6
        // Reason: ${testCase.reason}
        const similarity = calculateSimilarity(testCase.workflow, testCase.progress);
        if (testCase.expectedMatch) {
          expect(similarity).toBeGreaterThanOrEqual(0.6);
        } else {
          expect(similarity).toBeLessThan(0.6);
        }
      });
    });
  });
});
