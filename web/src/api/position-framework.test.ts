import { describe, expect, it } from 'vitest';
import {
  archiveCareerPath,
  archivePositionDefinition,
  archivePositionFamily,
  archivePositionLevel,
  archivePromotionPath,
  cloneCareerPath,
  clonePositionDefinition,
  clonePositionFamily,
  clonePositionLevel,
  clonePromotionPath,
  createCareerPath,
  createPositionDefinition,
  createPositionFamily,
  createPositionLevel,
  createPromotionPath,
  deleteCareerPath,
  deletePositionDefinition,
  deletePositionFamily,
  deletePositionLevel,
  deletePromotionPath,
  fetchCareerPaths,
  fetchPositionDefinitions,
  fetchPositionFamilies,
  fetchPositionLevels,
  fetchPromotionPaths,
  updateCareerPath,
  updatePositionDefinition,
  updatePositionFamily,
  updatePositionLevel,
  updatePromotionPath,
  versionCareerPath,
  versionPositionDefinition,
  versionPositionFamily,
  versionPositionLevel,
  versionPromotionPath,
} from './position-framework';

describe('position-framework API client', () => {
  it('exports framework entity helpers', () => {
    expect(typeof fetchPositionFamilies).toBe('function');
    expect(typeof createPositionFamily).toBe('function');
    expect(typeof updatePositionFamily).toBe('function');
    expect(typeof deletePositionFamily).toBe('function');
    expect(typeof archivePositionFamily).toBe('function');
    expect(typeof clonePositionFamily).toBe('function');
    expect(typeof versionPositionFamily).toBe('function');
    expect(typeof createPositionLevel).toBe('function');
    expect(typeof updatePositionLevel).toBe('function');
    expect(typeof deletePositionLevel).toBe('function');
    expect(typeof archivePositionLevel).toBe('function');
    expect(typeof clonePositionLevel).toBe('function');
    expect(typeof versionPositionLevel).toBe('function');
    expect(typeof fetchPositionLevels).toBe('function');
    expect(typeof createPositionDefinition).toBe('function');
    expect(typeof updatePositionDefinition).toBe('function');
    expect(typeof deletePositionDefinition).toBe('function');
    expect(typeof archivePositionDefinition).toBe('function');
    expect(typeof clonePositionDefinition).toBe('function');
    expect(typeof versionPositionDefinition).toBe('function');
    expect(typeof fetchPositionDefinitions).toBe('function');
    expect(typeof createCareerPath).toBe('function');
    expect(typeof updateCareerPath).toBe('function');
    expect(typeof deleteCareerPath).toBe('function');
    expect(typeof archiveCareerPath).toBe('function');
    expect(typeof cloneCareerPath).toBe('function');
    expect(typeof versionCareerPath).toBe('function');
    expect(typeof fetchCareerPaths).toBe('function');
    expect(typeof createPromotionPath).toBe('function');
    expect(typeof updatePromotionPath).toBe('function');
    expect(typeof deletePromotionPath).toBe('function');
    expect(typeof archivePromotionPath).toBe('function');
    expect(typeof clonePromotionPath).toBe('function');
    expect(typeof versionPromotionPath).toBe('function');
    expect(typeof fetchPromotionPaths).toBe('function');
  });
});
