// ============================================================================
// modules/recruitment/domain/services/pipeline.service.unit.spec.ts
// ============================================================================

import { PipelineService, CandidateStage, COMMISSION_QUALIFYING_STAGES } from './pipeline.service';
import { InvalidStageTransitionError } from '../errors/recruitment.errors';

describe('PipelineService', () => {
  const svc = new PipelineService();

  // ── isValidTransition ─────────────────────────────────────────────────────

  describe('isValidTransition', () => {
    // ── Valid forward transitions ──────────────────────────────────────────
    it('new → lead is valid', ()       => expect(svc.isValidTransition('new', 'lead')).toBe(true));
    it('new → screened is valid', ()   => expect(svc.isValidTransition('new', 'screened')).toBe(true));
    it('new → interview is valid', ()  => expect(svc.isValidTransition('new', 'interview')).toBe(true));
    it('new → rejected is valid', ()   => expect(svc.isValidTransition('new', 'rejected')).toBe(true));
    it('lead → screened is valid', ()  => expect(svc.isValidTransition('lead', 'screened')).toBe(true));
    it('lead → interview is valid', () => expect(svc.isValidTransition('lead', 'interview')).toBe(true));
    it('lead → rejected is valid', ()  => expect(svc.isValidTransition('lead', 'rejected')).toBe(true));
    it('screened → interview is valid', () => expect(svc.isValidTransition('screened', 'interview')).toBe(true));
    it('screened → rejected is valid', () => expect(svc.isValidTransition('screened', 'rejected')).toBe(true));
    it('interview → offer is valid', () => expect(svc.isValidTransition('interview', 'offer')).toBe(true));
    it('interview → screened is valid (backward allowed)', () => expect(svc.isValidTransition('interview', 'screened')).toBe(true));
    it('interview → rejected is valid', () => expect(svc.isValidTransition('interview', 'rejected')).toBe(true));
    it('offer → hired is valid', ()    => expect(svc.isValidTransition('offer', 'hired')).toBe(true));
    it('offer → started is valid', ()  => expect(svc.isValidTransition('offer', 'started')).toBe(true));
    it('offer → rejected is valid', () => expect(svc.isValidTransition('offer', 'rejected')).toBe(true));
    it('hired → started is valid', ()   => expect(svc.isValidTransition('hired', 'started')).toBe(true));
    it('hired → passed_probation is valid', () => expect(svc.isValidTransition('hired', 'passed_probation')).toBe(true));
    it('started → passed_probation is valid', () => expect(svc.isValidTransition('started', 'passed_probation')).toBe(true));
    it('started → rejected is valid', () => expect(svc.isValidTransition('started', 'rejected')).toBe(true));

    // ── Invalid transitions ────────────────────────────────────────────────
    it('passed_probation → any is invalid (terminal)', () => {
      const stages: CandidateStage[] = ['new', 'lead', 'screened', 'interview', 'offer', 'hired', 'started', 'rejected'];
      stages.forEach(to => {
        expect(svc.isValidTransition('passed_probation', to)).toBe(false);
      });
    });

    it('rejected → any is invalid (terminal)', () => {
      const stages: CandidateStage[] = ['new', 'lead', 'screened', 'interview', 'offer', 'hired', 'started', 'passed_probation'];
      stages.forEach(to => {
        expect(svc.isValidTransition('rejected', to)).toBe(false);
      });
    });

    it('interview → lead is invalid (skipping backward too far)', () => {
      expect(svc.isValidTransition('interview', 'lead')).toBe(false);
    });

    it('offer → screened is invalid (skipping too far back)', () => {
      expect(svc.isValidTransition('offer', 'screened')).toBe(false);
    });

    it('new → passed_probation is invalid (skipping forward too far)', () => {
      expect(svc.isValidTransition('new', 'passed_probation')).toBe(false);
    });

    it('lead → offer is invalid (skipping a stage)', () => {
      expect(svc.isValidTransition('lead', 'offer')).toBe(false);
    });

    it('same-stage is invalid for non-terminal stages', () => {
      const stages: CandidateStage[] = ['new', 'lead', 'screened', 'interview', 'offer', 'hired', 'started'];
      stages.forEach(s => {
        expect(svc.isValidTransition(s, s)).toBe(false);
      });
    });
  });

  // ── assertValidTransition ─────────────────────────────────────────────────

  describe('assertValidTransition', () => {
    it('does not throw for valid transition lead → interview', () => {
      expect(() => svc.assertValidTransition('lead', 'interview')).not.toThrow();
    });

    it('throws InvalidStageTransitionError for invalid transition', () => {
      expect(() => svc.assertValidTransition('passed_probation', 'lead')).toThrow(InvalidStageTransitionError);
    });

    it('error message includes both from and to stages', () => {
      try {
        svc.assertValidTransition('rejected', 'interview');
        fail('expected error');
      } catch (e) {
        expect((e as Error).message).toMatch(/rejected/);
        expect((e as Error).message).toMatch(/interview/);
      }
    });

    it('throws for rejected → passed_probation (resurrection not allowed)', () => {
      expect(() => svc.assertValidTransition('rejected', 'passed_probation')).toThrow(InvalidStageTransitionError);
    });

    it('does not throw for offer → hired (acceptance)', () => {
      expect(() => svc.assertValidTransition('offer', 'hired')).not.toThrow();
    });
  });

  // ── isTerminal ────────────────────────────────────────────────────────────

  describe('isTerminal', () => {
    it('passed_probation is terminal', () => {
      expect(svc.isTerminal('passed_probation')).toBe(true);
    });

    it('rejected is terminal', () => {
      expect(svc.isTerminal('rejected')).toBe(true);
    });

    it('non-terminal stages return false', () => {
      const nonTerminal: CandidateStage[] = ['new', 'lead', 'screened', 'interview', 'offer', 'hired', 'started'];
      nonTerminal.forEach(s => {
        expect(svc.isTerminal(s)).toBe(false);
      });
    });

    it('exactly two stages are terminal', () => {
      const allStages: CandidateStage[] = ['new', 'lead', 'screened', 'interview', 'offer', 'hired', 'started', 'passed_probation', 'rejected'];
      const terminalCount = allStages.filter(s => svc.isTerminal(s)).length;
      expect(terminalCount).toBe(2);
    });
  });

  // ── qualifiesForCommission ────────────────────────────────────────────────

  describe('qualifiesForCommission', () => {
    it('started qualifies (เด็กลงงาน)', () => expect(svc.qualifiesForCommission('started')).toBe(true));

    it('interview does not qualify', () => expect(svc.qualifiesForCommission('interview')).toBe(false));
    it('offer does not qualify', () => expect(svc.qualifiesForCommission('offer')).toBe(false));
    it('hired does not qualify', () => expect(svc.qualifiesForCommission('hired')).toBe(false));
    it('passed_probation does not qualify', () => expect(svc.qualifiesForCommission('passed_probation')).toBe(false));
    it('new does not qualify', () => expect(svc.qualifiesForCommission('new')).toBe(false));
    it('lead does not qualify', () => expect(svc.qualifiesForCommission('lead')).toBe(false));
    it('screened does not qualify', () => expect(svc.qualifiesForCommission('screened')).toBe(false));
    it('rejected does not qualify', () => expect(svc.qualifiesForCommission('rejected')).toBe(false));

    it('COMMISSION_QUALIFYING_STAGES constant has exactly started only', () => {
      expect(COMMISSION_QUALIFYING_STAGES).toEqual(['started']);
    });

    it('all COMMISSION_QUALIFYING_STAGES return true from qualifiesForCommission', () => {
      COMMISSION_QUALIFYING_STAGES.forEach(stage => {
        expect(svc.qualifiesForCommission(stage)).toBe(true);
      });
    });
  });

  // ── stageOrder ────────────────────────────────────────────────────────────

  describe('stageOrder', () => {
    it('new comes before lead', () => {
      expect(svc.stageOrder('new')).toBeLessThan(svc.stageOrder('lead'));
    });

    it('lead comes before interview', () => {
      expect(svc.stageOrder('lead')).toBeLessThan(svc.stageOrder('interview'));
    });

    it('interview comes before offer', () => {
      expect(svc.stageOrder('interview')).toBeLessThan(svc.stageOrder('offer'));
    });

    it('offer comes before hired', () => {
      expect(svc.stageOrder('offer')).toBeLessThan(svc.stageOrder('hired'));
    });

    it('hired comes before started', () => {
      expect(svc.stageOrder('hired')).toBeLessThan(svc.stageOrder('started'));
    });

    it('started comes before passed_probation', () => {
      expect(svc.stageOrder('started')).toBeLessThan(svc.stageOrder('passed_probation'));
    });

    it('returns -1 for rejected (not in the order array)', () => {
      expect(svc.stageOrder('rejected')).toBe(-1);
    });

    it('pipeline order is strictly increasing for non-rejected stages', () => {
      const orderedStages: CandidateStage[] = ['new', 'lead', 'screened', 'interview', 'offer', 'hired', 'started', 'passed_probation'];
      for (let i = 0; i < orderedStages.length - 1; i++) {
        expect(svc.stageOrder(orderedStages[i]!)).toBeLessThan(svc.stageOrder(orderedStages[i + 1]!));
      }
    });
  });

  // ── Pipeline property: every valid transition goes forward or to rejection ─

  describe('pipeline integrity properties', () => {
    it('every forward transition (excluding backward interview→screened and →rejected) increases stage order', () => {
      const forward: Array<[CandidateStage, CandidateStage]> = [
        ['new',       'lead'],
        ['lead',      'interview'],
        ['screened',  'interview'],
        ['interview', 'offer'],
        ['offer',     'hired'],
        ['offer',     'started'],
        ['hired',     'started'],
        ['hired',     'passed_probation'],
        ['started',   'passed_probation'],
      ];
      forward.forEach(([from, to]) => {
        expect(svc.stageOrder(from)).toBeLessThan(svc.stageOrder(to));
      });
    });

    it('no terminal stage has any valid outgoing transitions', () => {
      const terminals: CandidateStage[] = ['passed_probation', 'rejected'];
      const allStages: CandidateStage[] = ['new', 'lead', 'screened', 'interview', 'offer', 'hired', 'started', 'passed_probation', 'rejected'];
      terminals.forEach(terminal => {
        allStages.forEach(to => {
          expect(svc.isValidTransition(terminal, to)).toBe(false);
        });
      });
    });
  });
});
