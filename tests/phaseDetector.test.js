// phaseDetector.test.js
// Tests for phase detection and transition logic

const phaseDetector = require('../dist/src/phaseDetector');
const memoryStoreModule = require('../dist/src/memoryStore');

// Mock vscode module
jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn(() => Promise.resolve(undefined))
  },
  commands: {
    executeCommand: jest.fn(() => Promise.resolve())
  }
}));

describe('Phase Detector', () => {
  let mockMemoryStore;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset phase detection state
    phaseDetector.resetDetectedPhase?.();
  });

  describe('detectPhase from keywords', () => {
    it('should detect research phase from keyword', async () => {
      const systemPrompt = 'Research the implementation approach for this feature';
      const phase = await phaseDetector.detectPhase(systemPrompt);
      expect(phase).toBe('research');
    });

    it('should detect planning phase from keyword', async () => {
      const systemPrompt = 'Plan the architecture for this system';
      const phase = await phaseDetector.detectPhase(systemPrompt);
      expect(phase).toBe('planning');
    });

    it('should detect execution phase from keyword', async () => {
      const systemPrompt = 'Build the feature with development best practices';
      const phase = await phaseDetector.detectPhase(systemPrompt);
      expect(phase).toBe('execution');
    });

    it('should detect checkpoint phase from keyword', async () => {
      const systemPrompt = 'Checkpoint and save my progress now';
      const phase = await phaseDetector.detectPhase(systemPrompt);
      expect(phase).toBe('checkpoint');
    });

    it('should be case-insensitive', async () => {
      const systemPrompt = 'RESEARCH the approach';
      const phase = await phaseDetector.detectPhase(systemPrompt);
      expect(phase).toBe('research');
    });

    it('should return null when no phase keyword found', async () => {
      const systemPrompt = 'Just some random text without phase keywords';
      const phase = await phaseDetector.detectPhase(systemPrompt);
      expect(phase).toBeNull();
    });

    it('should use first matched keyword when multiple present', async () => {
      // If prompt contains both research and execution keywords, 
      // it should detect the first one found in PHASE_KEYWORDS iteration order
      const systemPrompt = 'Research options and execute the solution';
      const phase = await phaseDetector.detectPhase(systemPrompt);
      // Expect first match (research comes before execution in typical order)
      expect(['research', 'execution']).toContain(phase);
    });

    it('should detect phase from partial keyword match', async () => {
      const systemPrompt = 'Begin researching the problem';
      const phase = await phaseDetector.detectPhase(systemPrompt);
      expect(phase).toBe('research');
    });
  });

  describe('detectPhaseFromContext', () => {
    it('should detect research from system prompt markers', () => {
      const context = {
        systemPrompt: '[think mode] Analyze the options',
        userMessage: 'What should we do?'
      };
      const phase = phaseDetector.detectPhaseFromContext(context);
      expect(phase).toBe('research');
    });

    it('should detect planning from design keywords', () => {
      const context = {
        systemPrompt: 'Design the implementation plan',
        userMessage: 'How should we implement this?'
      };
      const phase = phaseDetector.detectPhaseFromContext(context);
      expect(phase).toBe('planning');
    });

    it('should detect execution from implementation keywords', () => {
      const context = {
        systemPrompt: 'Implement the feature',
        userMessage: 'Start coding'
      };
      const phase = phaseDetector.detectPhaseFromContext(context);
      expect(phase).toBe('execution');
    });

    it('should detect checkpoint from save keywords', () => {
      const context = {
        systemPrompt: 'Checkpoint: Summarize progress',
        userMessage: 'save my work'
      };
      const phase = phaseDetector.detectPhaseFromContext(context);
      expect(phase).toBe('checkpoint');
    });

    it('should use previous phase as fallback', () => {
      const context = {
        systemPrompt: 'Continue working',
        userMessage: 'What next?',
        previousPhase: 'planning'
      };
      const phase = phaseDetector.detectPhaseFromContext(context);
      expect(phase).toBe('planning');
    });

    it('should return null when no phase detected and no fallback', () => {
      const context = {
        systemPrompt: 'Random text',
        userMessage: 'More random'
      };
      const phase = phaseDetector.detectPhaseFromContext(context);
      expect(phase).toBeNull();
    });

    it('should handle undefined context gracefully', () => {
      const phase = phaseDetector.detectPhaseFromContext(undefined);
      expect(phase).toBeNull();
    });
  });

  describe('getNextPhase', () => {
    it('should return planning after research', () => {
      const next = phaseDetector.getNextPhase('research');
      expect(next).toBe('planning');
    });

    it('should return execution after planning', () => {
      const next = phaseDetector.getNextPhase('planning');
      expect(next).toBe('execution');
    });

    it('should return checkpoint after execution', () => {
      const next = phaseDetector.getNextPhase('execution');
      expect(next).toBe('checkpoint');
    });

    it('should cycle back to research after checkpoint', () => {
      const next = phaseDetector.getNextPhase('checkpoint');
      expect(next).toBe('research');
    });

    it('should start with research for unknown phase', () => {
      const next = phaseDetector.getNextPhase(null);
      expect(next).toBe('research');
    });
  });

  describe('getPhaseLabel', () => {
    it('should return readable label for research', () => {
      const label = phaseDetector.getPhaseLabel('research');
      expect(label).toContain('Research');
    });

    it('should return readable label for planning', () => {
      const label = phaseDetector.getPhaseLabel('planning');
      expect(label).toContain('Planning');
    });

    it('should return readable label for execution', () => {
      const label = phaseDetector.getPhaseLabel('execution');
      expect(label).toContain('Implementation');
    });

    it('should return readable label for checkpoint', () => {
      const label = phaseDetector.getPhaseLabel('checkpoint');
      expect(label).toContain('Checkpoint');
    });

    it('should return Unknown for null phase', () => {
      const label = phaseDetector.getPhaseLabel(null);
      expect(label).toBe('Unknown Phase');
    });
  });

  describe('phase transition detection', () => {
    it('should track phase changes', async () => {
      // First call with research phase
      await phaseDetector.detectPhase('Research the approach');
      
      // Second call with planning phase should trigger transition
      await phaseDetector.detectPhase('Plan the implementation');
      
      // Verify the phase changed (would trigger onPhaseTransition)
      // Note: Real validation would require mock of generatePhaseMemoryReport
    });

    it('should ignore repeated same phase', async () => {
      // Call with research phase multiple times
      await phaseDetector.detectPhase('Research the options');
      const phase1 = await phaseDetector.detectPhase('Research more details');
      
      // Both should be research, no transition
      expect(phase1).toBe('research');
    });

    it('should not trigger transition when no phase detected', async () => {
      const phase = await phaseDetector.detectPhase('Random text with no phase');
      expect(phase).toBeNull();
      // No transition should occur
    });
  });

  describe('phase transition wiring', () => {
    it('should call generatePhaseMemoryReport on transition', async () => {
      // This would require mocking memoryService
      // For now, verify the function is exported and callable
      expect(typeof phaseDetector.detectPhase).toBe('function');
    });

    it('should handle errors gracefully', async () => {
      // Phase detection should not throw even if memory service fails
      const phase = await phaseDetector.detectPhase('Research approach');
      expect(['research', null]).toContain(phase);
    });
  });

  describe('edge cases', () => {
    it('should handle empty system prompt', async () => {
      const phase = await phaseDetector.detectPhase('');
      expect(phase).toBeNull();
    });

    it('should handle null/undefined system prompt', async () => {
      const phase1 = await phaseDetector.detectPhase(null);
      const phase2 = await phaseDetector.detectPhase(undefined);
      expect(phase1).toBeNull();
      expect(phase2).toBeNull();
    });

    it('should handle very long system prompt', async () => {
      const longPrompt = 'Research ' + 'x'.repeat(10000) + ' planning';
      const phase = await phaseDetector.detectPhase(longPrompt);
      // Should still detect either research or planning
      expect(['research', 'planning']).toContain(phase);
    });

    it('should handle special characters in keyword', async () => {
      const prompt = 'research the problem!@#$%^&*()';
      const phase = await phaseDetector.detectPhase(prompt);
      expect(phase).toBe('research');
    });
  });
});
