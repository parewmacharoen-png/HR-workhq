import { apiGet, apiPost } from './client';

export type AssetCategory = 'notebook' | 'phone' | 'tablet' | 'vehicle' | 'equipment';
export type AssetStatus = 'available' | 'assigned' | 'maintenance' | 'retired';

export interface AssetListItem {
  id: string;
  companyId: string;
  assetTag: string;
  name: string;
  category: AssetCategory | null;
  status: AssetStatus;
  purchaseDate: string | null;
  value: number | null;
  createdAt: string;
  updatedAt: string;
  activeAssignment?: {
    id: string;
    employeeId: string;
    assignedAt: string;
    employee?: {
      id: string;
      globalId: string;
      firstName: string;
      lastName: string;
    };
  } | null;
}

export interface BorrowSummaryItem {
  assignmentId: string;
  assetId: string;
  assetTag: string;
  name: string;
  category: AssetCategory | null;
  assignedAt: string;
  notes: string | null;
}

export interface BorrowSummaryEmployee {
  employeeId: string;
  globalId: string;
  firstName: string;
  lastName: string;
  items: BorrowSummaryItem[];
}

export interface BorrowSummaryResponse {
  companyId: string;
  totalActive: number;
  byEmployee: BorrowSummaryEmployee[];
}

export interface EmployeeAssetsResponse {
  employeeId: string;
  companyId: string;
  active: Array<{
    id: string;
    assetId: string;
    assignedAt: string;
    returnedAt: string | null;
    conditionOut: string | null;
    asset?: {
      id: string;
      assetTag: string;
      name: string;
      category: string | null;
    };
  }>;
  history: Array<{
    id: string;
    assetId: string;
    assignedAt: string;
    returnedAt: string | null;
    conditionOut: string | null;
    conditionIn: string | null;
    asset?: {
      id: string;
      assetTag: string;
      name: string;
      category: string | null;
    };
  }>;
}

export interface BorrowAssetInput {
  employeeId: string;
  name: string;
  category?: AssetCategory;
  notes?: string;
  assetTag?: string;
}

export function fetchAssetList(
  companyId: string,
  params?: { category?: AssetCategory; status?: AssetStatus; search?: string },
): Promise<AssetListItem[]> {
  const q = new URLSearchParams();
  if (params?.category) q.set('category', params.category);
  if (params?.status) q.set('status', params.status);
  if (params?.search?.trim()) q.set('search', params.search.trim());
  const qs = q.toString();
  return apiGet(`/assets/companies/${encodeURIComponent(companyId)}${qs ? `?${qs}` : ''}`);
}

export function fetchBorrowSummary(companyId: string): Promise<BorrowSummaryResponse> {
  return apiGet(`/assets/companies/${encodeURIComponent(companyId)}/borrow-summary`);
}

export function borrowAsset(companyId: string, input: BorrowAssetInput): Promise<unknown> {
  return apiPost(`/assets/companies/${encodeURIComponent(companyId)}/borrow`, input);
}

export function returnAsset(assetId: string, notes?: string): Promise<unknown> {
  return apiPost(`/assets/${encodeURIComponent(assetId)}/return`, {
    conditionIn: notes?.trim() || undefined,
  });
}

export function fetchEmployeeAssets(
  companyId: string,
  employeeId: string,
): Promise<EmployeeAssetsResponse> {
  return apiGet(
    `/assets/companies/${encodeURIComponent(companyId)}/employees/${encodeURIComponent(employeeId)}`,
  );
}
