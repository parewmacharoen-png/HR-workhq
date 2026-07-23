import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { DocumentCenterService } from './document-center.service';
import { ActorContext } from '../../../shared/kernel/actor-context';

@Injectable()
export class DocumentCenterTelegramHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly documents: DocumentCenterService,
  ) {}

  async handleCallback(
    account: { id: string; userId: string },
    chatId: number,
    data: string,
  ): Promise<boolean> {
    if (data === 'document-center:knowledge') {
      await this.showKnowledge(account, chatId);
      return true;
    }
    if (data === 'document-center:my' || data === 'document:menu') {
      await this.showDocumentMenu(chatId);
      return true;
    }
    if (data === 'document:latest') {
      await this.showLatest(account, chatId);
      return true;
    }
    if (data === 'document:required') {
      await this.showRequired(account, chatId);
      return true;
    }
    if (data === 'document:expiring') {
      await this.showExpiring(account, chatId);
      return true;
    }
    if (data.startsWith('document:download:')) {
      const docId = data.replace('document:download:', '');
      await this.showDownloadInfo(account, chatId, docId);
      return true;
    }
    return false;
  }

  private async showDocumentMenu(chatId: number): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text: '📄 <b>เอกสารของฉัน</b>',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: 'เอกสารล่าสุด', callback_data: 'document:latest' }],
          [{ text: 'เอกสารที่ต้องอัปโหลด', callback_data: 'document:required' }],
          [{ text: 'เอกสารหมดอายุ', callback_data: 'document:expiring' }],
          [{ text: 'ดาวน์โหลดเอกสาร', callback_data: 'document-center:my' }],
        ],
      },
    });
  }

  private async showLatest(account: { userId: string }, chatId: number): Promise<void> {
    const docs = await this.documents.listMyDocuments(this.actor(account.userId, null));
    if (!docs.length) {
      await this.gateway.sendMessage({ chatId, text: '📄 ยังไม่มีเอกสาร' });
      return;
    }
    const latest = docs[0];
    await this.gateway.sendMessage({
      chatId,
      text: [
        '📄 <b>เอกสารล่าสุด</b>',
        '',
        `${esc(latest.fileName)} (${latest.docType})`,
      ].join('\n'),
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[
          { text: '📥 ดาวน์โหลด', callback_data: `document:download:${latest.id}` },
        ]],
      },
    });
  }

  private async showRequired(account: { userId: string }, chatId: number): Promise<void> {
    const missing = await this.documents.listRequiredMissing(this.actor(account.userId, null));
    const text = missing.length
      ? ['📋 <b>เอกสารที่ต้องอัปโหลด</b>', '', ...missing.map((t) => `• ${t}`)].join('\n')
      : '✅ เอกสารที่จำเป็นครบแล้ว';
    await this.gateway.sendMessage({ chatId, text, parseMode: 'HTML' });
  }

  private async showExpiring(account: { userId: string }, chatId: number): Promise<void> {
    const expiring = await this.documents.listExpiring(this.actor(account.userId, null));
    if (!expiring.length) {
      await this.gateway.sendMessage({ chatId, text: '✅ ไม่มีเอกสารใกล้หมดอายุ' });
      return;
    }
    const lines = expiring.map(
      (d) => `• ${esc(d.fileName)} — หมดอายุ ${d.expiresAt?.toISOString().slice(0, 10)}`,
    );
    await this.gateway.sendMessage({
      chatId,
      text: ['⏰ <b>เอกสารหมดอายุ</b>', '', ...lines].join('\n'),
      parseMode: 'HTML',
    });
  }

  private async showDownloadInfo(
    account: { userId: string },
    chatId: number,
    docId: string,
  ): Promise<void> {
    try {
      const doc = await this.documents.getDocument(this.actor(account.userId, null), docId);
      await this.gateway.sendMessage({
        chatId,
        text: [
          '📥 <b>ดาวน์โหลดเอกสาร</b>',
          `ไฟล์: ${esc(doc.fileName)}`,
          '',
          'เปิดดาวน์โหลดได้ที่ Document Center บนเว็บ WorkHQ',
          `หรือเรียก API: GET /documents/${docId}/download`,
        ].join('\n'),
        parseMode: 'HTML',
      });
    } catch {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบเอกสาร' });
    }
  }

  private actor(userId: string, companyId: string | null): ActorContext {
    return { userId, companyId, impersonatorUserId: null };
  }

  private async showKnowledge(
    account: { userId: string },
    chatId: number,
  ): Promise<void> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employee: { users: { some: { id: account.userId } }, deletedAt: null },
        effectiveTo: null,
        deletedAt: null,
      },
      orderBy: { isPrimaryCompany: 'desc' },
      select: { companyId: true },
    });
    const articles = await this.documents.listKnowledgeArticles(
      this.actor(account.userId, assignment?.companyId ?? null),
      assignment?.companyId,
    );
    if (!articles.length) {
      await this.gateway.sendMessage({
        chatId,
        text: '📚 <b>ศูนย์ความรู้</b>\n\nยังไม่มีบทความ',
        parseMode: 'HTML',
      });
      return;
    }
    const lines = articles.slice(0, 10).map(
      (a) => `• ${esc(a.title)}${a.category ? ` (${a.category})` : ''}`,
    );
    await this.gateway.sendMessage({
      chatId,
      text: ['📚 <b>ศูนย์ความรู้</b>', '', ...lines].join('\n'),
      parseMode: 'HTML',
    });
  }

  private async showMyDocuments(
    account: { userId: string },
    chatId: number,
  ): Promise<void> {
    const docs = await this.documents.listMyDocuments(this.actor(account.userId, null));
    if (!docs.length) {
      await this.gateway.sendMessage({
        chatId,
        text: '📄 <b>เอกสารของฉัน</b>\n\nยังไม่มีเอกสาร',
        parseMode: 'HTML',
      });
      return;
    }
    const lines = docs.slice(0, 10).map((d) => {
      const exp = d.expiresAt
        ? ` (หมดอายุ ${d.expiresAt.toISOString().slice(0, 10)})`
        : '';
      return `• ${esc(d.fileName)} — ${d.docType}${exp}`;
    });
    const buttons = docs.slice(0, 5).map((d) => ([{
      text: `📥 ${d.fileName.slice(0, 20)}`,
      callback_data: `document:download:${d.id}`,
    }]));
    await this.gateway.sendMessage({
      chatId,
      text: ['📄 <b>เอกสารของฉัน</b>', '', ...lines].join('\n'),
      parseMode: 'HTML',
      replyMarkup: buttons.length ? { inline_keyboard: buttons } : undefined,
    });
  }
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
