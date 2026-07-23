// ============================================================================
// modules/organization/domain/repositories/organization.repository.ts
// Ports (interfaces). Implemented by infrastructure adapters. Tokens are used
// for Nest DI since interfaces vanish at runtime.
// ============================================================================

import { Company } from '../entities/company.entity';
import { Team } from '../entities/team.entity';

export const COMPANY_REPOSITORY = Symbol('COMPANY_REPOSITORY');
export const TEAM_REPOSITORY = Symbol('TEAM_REPOSITORY');
export const FUNCTION_REPOSITORY = Symbol('FUNCTION_REPOSITORY');

export interface CompanyRepository {
  findById(id: string): Promise<Company | null>;
  findByCode(code: string): Promise<Company | null>;
  listActive(): Promise<Company[]>;
  save(company: Company, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

export interface TeamRepository {
  findById(id: string): Promise<Team | null>;
  findByCompanyAndName(companyId: string, name: string): Promise<Team | null>;
  listByCompany(companyId: string): Promise<Team[]>;
  save(team: Team, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

export interface FunctionView {
  id: string;
  code: string;
  name: string;
}

export interface FunctionRepository {
  findById(id: string): Promise<FunctionView | null>;
  listAll(): Promise<FunctionView[]>;
}
