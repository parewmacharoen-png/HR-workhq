import { formatTelegramHelpText, TELEGRAM_BOT_COMMANDS } from './telegram-bot-commands';

describe('telegram-bot-commands', () => {
  it('lists every registered command in help text', () => {
    const help = formatTelegramHelpText();
    for (const cmd of TELEGRAM_BOT_COMMANDS) {
      expect(help).toContain(`/${cmd.command}`);
      expect(help).toContain(cmd.description);
    }
  });
});
