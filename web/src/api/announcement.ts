import { apiGet, apiPatch, apiPost } from './client';

export interface AnnouncementRow {
  id: string;
  title: string;
  body?: string;
  status: string;
  announcementType: string;
  publishedAt?: string;
  createdAt: string;
  delivery?: {
    id: string;
    deliveredAt?: string;
    openedAt?: string;
    readAt?: string;
    acknowledgedAt?: string;
  };
}

export interface AnnouncementDashboard {
  published: number;
  draft: number;
  unopened: number;
  unacknowledged: number;
  acknowledgementRate: number;
  overdueAcknowledgements: Array<{
    employeeId: string;
    employeeName: string;
    deliveryId: string;
    announcementId: string;
  }>;
}

export function listAnnouncements(params?: { companyId?: string; status?: string }) {
  return apiGet<AnnouncementRow[]>('/announcements', params);
}

export function listMyAnnouncements() {
  return apiGet<AnnouncementRow[]>('/announcements/my');
}

export function getAnnouncementDashboard(companyId: string) {
  return apiGet<AnnouncementDashboard>('/announcements/dashboard', { companyId });
}

export function createAnnouncement(body: {
  companyId?: string;
  teamId?: string;
  title: string;
  body?: string;
  announcementType?: string;
}) {
  return apiPost<AnnouncementRow>('/announcements', body);
}

export function publishAnnouncement(id: string) {
  return apiPost(`/announcements/${id}/publish`, {});
}

export function archiveAnnouncement(id: string) {
  return apiPost(`/announcements/${id}/archive`, {});
}

export function updateAnnouncement(id: string, body: { title?: string; body?: string }) {
  return apiPatch(`/announcements/${id}`, body);
}

export function acknowledgeAnnouncementDelivery(deliveryId: string) {
  return apiPost(`/announcements/deliveries/${deliveryId}/acknowledge`, {});
}

export function openAnnouncementDelivery(deliveryId: string) {
  return apiPost(`/announcements/deliveries/${deliveryId}/open`, {});
}
