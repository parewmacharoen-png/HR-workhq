// ============================================================================
// modules/knowledge/domain/content/company-policy-articles.unit.spec.ts
// ============================================================================

import {
  COMPANY_POLICY_ARTICLES,
  COMPANY_POLICY_SLUGS,
  REQUIRED_POLICY_TAGS,
} from './company-policy-articles';

describe('Company policy KB articles', () => {
  it('defines one article per major policy section', () => {
    expect(COMPANY_POLICY_ARTICLES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(COMPANY_POLICY_SLUGS).size).toBe(COMPANY_POLICY_SLUGS.length);
  });

  it('covers all required tags across articles', () => {
    const tagSet = new Set(COMPANY_POLICY_ARTICLES.flatMap((a) => a.tags));
    for (const tag of REQUIRED_POLICY_TAGS) {
      expect(tagSet.has(tag)).toBe(true);
    }
  });

  it('includes handbook, marketing commission, admin commission, referral, and leave sections', () => {
    const slugs = new Set(COMPANY_POLICY_SLUGS);
    expect(slugs.has('handbook-leave-benefits')).toBe(true);
    expect(slugs.has('marketing-commission-kpi-target')).toBe(true);
    expect(slugs.has('admin-commission-leave-penalties')).toBe(true);
    expect(slugs.has('referral-reward-amount')).toBe(true);
    expect(slugs.has('leave-reschedule-policy')).toBe(true);
  });

  it('each article has title, body, category, and at least one tag', () => {
    for (const article of COMPANY_POLICY_ARTICLES) {
      expect(article.title.trim().length).toBeGreaterThan(0);
      expect(article.body.trim().length).toBeGreaterThan(20);
      expect(article.category.trim().length).toBeGreaterThan(0);
      expect(article.tags.length).toBeGreaterThan(0);
    }
  });
});
