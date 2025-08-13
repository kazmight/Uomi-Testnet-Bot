// crypto-bot-ui.js
const EventEmitter = require('events');
const blessed = require('blessed');
const figlet = require('figlet');
const moment = require('moment');

class CryptoBotUI extends EventEmitter {
  constructor(options = {}) {
    super();

    this.opts = {
      title: options.title || 'Dashboard',
      demo: options.demo ?? false,
      controlled: options.controlled ?? true,
      tokenColumns: options.tokenColumns || 2, 
      colors: {
        primary: '#00ff00',
        secondary: '#ffff00',
        info: '#3498db',
        warning: '#f39c12',
        error: '#e74c3c',
        success: '#2ecc71',
        text: '#ffffff',
        background: '#1a1a1a',
        purple: '#9b59b6',
        cyan: '#00ffff',
        pink: '#ff69b4',
        orange: '#ff8c00',
        ...(options.colors || {})
      },
      menuItems: options.menuItems || [
        '1. Action A',
        '2. Action B',
        '3. Action C',
        '4. Exit'
      ],
    };

    this.bannerTexts = options.bannerTexts || ['INVICTUSLABS', 'TESTNET', 'AUTOMATION'];
    this.bannerFont = options.bannerFont || 'ANSI Shadow';

    const C = this.opts.colors;

    this.isActive = false;
    this.transactionCount = 0;
    this.successRate = 100;
    this.failedTx = 0;
    this.pendingTx = 0;
    this.currentGasPrice = 0;
    this._intervals = new Set();

    // Wallet (native)
    this.nativeSymbol = options.nativeSymbol || 'NATIVE';
    this.walletData = {
      address: '-',
      nativeBalance: '-', 
      network: '-',
      gasPrice: '-',
      nonce: '-',
    };

    // tokens
    this.tokens = Array.from({ length: 10 }).map(() => ({
      enabled: true,
      name: '-',
      symbol: '-',
      balance: '-'
    }));

    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      dockBorders: true,
      title: this.opts.title,
      cursor: { artificial: true, shape: 'line', blink: true, color: null }
    });
    this.screen.key(['escape', 'q', 'C-c'], () => this.destroy());

    this.banner = blessed.box({
      parent: this.screen,
      top: 0, left: 'center', width: '100%', height: 6,
      align: 'center', tags: true, content: '',
      style: { bg: C.background }
    });
    this._setBannerFrame(this.bannerTexts[0], this.bannerFont, C.primary);
    this._animateBanner();

    this.mainContainer = blessed.box({
      parent: this.screen, top: 6, left: 0, width: '100%', height: '100%-9',
      style: { bg: C.background }
    });

    this.walletBox = blessed.box({
      parent: this.mainContainer, label: ' Wallet Information ',
      top: 0, left: 0, width: '50%', height: '40%', border: { type: 'line' },
      style: { fg: C.text, border: { fg: C.primary }, label: { fg: C.primary, bold: true } },
      tags: true, padding: 1
    });

    this.tokenBox = blessed.box({
      parent: this.mainContainer, label: ' Token Information ',
      top: 0, left: '50%', width: '50%', height: '40%', border: { type: 'line' },
      style: { fg: C.text, border: { fg: C.secondary }, label: { fg: C.secondary, bold: true } },
      tags: true, padding: 1
    });

    this.menuBox = blessed.box({
      parent: this.mainContainer, label: ' Transaction Menu ',
      top: '40%', left: 0, width: '30%', height: '60%',
      border: { type: 'line' },
      style: { fg: C.text, border: { fg: C.info }, label: { fg: C.info, bold: true } }
    });

    this.transactionList = blessed.list({
      parent: this.menuBox, top: 0, left: 0, width: '100%-2', height: '100%-2',
      keys: true, vi: true, mouse: true, tags: true,
      scrollbar: { ch: ' ', track: { bg: C.background }, style: { bg: C.cyan } },
      style: { selected: { bg: C.info, fg: 'black', bold: true }, item: { hover: { bg: C.background } } },
      items: this.opts.menuItems
    });

    this.transactionList.on('select', (item, index) => {
      const label = (item?.content || '').replace(/\x1b\[[0-9;]*m/g, '');
      this.emit('menu:select', label, index);
    });

    this.statsBox = blessed.box({
      parent: this.mainContainer, label: ' Statistics ',
      top: '40%', left: '30%', width: '35%', height: '30%',
      border: { type: 'line' },
      style: { fg: C.text, border: { fg: C.orange }, label: { fg: C.orange, bold: true } },
      tags: true, padding: 1
    });

    this.logsBox = blessed.log({
      parent: this.mainContainer, label: ' Transaction Logs ',
      top: '40%', left: '65%', width: '35%', height: '60%',
      border: { type: 'line' }, scrollable: true, alwaysScroll: true, mouse: true, keys: true, vi: true,
      scrollbar: { ch: ' ', track: { bg: C.background }, style: { bg: C.purple } },
      style: { fg: C.text, border: { fg: C.purple }, label: { fg: C.purple, bold: true } },
      tags: true
    });

    this.activityBox = blessed.box({
      parent: this.mainContainer, label: ' Activity Monitor ',
      top: '70%', left: '30%', width: '35%', height: '30%',
      border: { type: 'line' },
      style: { fg: C.text, border: { fg: C.pink }, label: { fg: C.pink, bold: true } },
      tags: true, padding: 1
    });

    this.statusBar = blessed.box({
      parent: this.screen, bottom: 0, left: 0, width: '100%', height: 3, border: { type: 'line' },
      style: { fg: C.text, bg: C.background, border: { fg: C.cyan } }, tags: true
    });
    this.statusText = blessed.text({ parent: this.statusBar, left: 1, top: 0, tags: true, content: '' });

    this._wireKeys();
    this._refreshAll();
    this.transactionList.focus();
    this.render();

    this._every(1000, () => { this._drawStatus(); this.render(); });
    this._welcomeLogs();
  }

  render() { try { this.screen?.render(); } catch (_) {} }
  destroy(code = 0) {
    for (const id of this._intervals) clearInterval(id);
    this._intervals.clear();
    try { this.screen?.destroy(); } catch (_) {}
    process.exit(code);
  }

  setMenu(items = []) {
    this.transactionList.setItems(items);
    this.transactionList.select(0);
    this.render();
  }

  setActive(active) {
    this.isActive = !!active;
    this._drawActivity();
    this._drawStatus();
    this.render();
  }

  setNativeSymbol(sym) {
    this.nativeSymbol = sym || this.nativeSymbol;
    this.updateWallet({});
  }

  setTokenColumns(n) {
    const cols = Math.max(1, Math.min(4, Number(n) || 2));
    this.opts.tokenColumns = cols;
    this._drawTokensGrid();
    this.render();
  }

  updateWallet(partial = {}) {
    Object.assign(this.walletData, partial);
    const C = this.opts.colors, w = this.walletData;
    const content =
      `{${C.cyan}-fg}Address:{/${C.cyan}-fg} ${String(w.address).substring(0, 20)}...\n` +
      `{${C.success}-fg}${this.nativeSymbol} Balance:{/${C.success}-fg} ${w.nativeBalance}\n` +
      `{${C.info}-fg}Network:{/${C.info}-fg} ${w.network}\n` +
      `{${C.purple}-fg}Gas Price:{/${C.purple}-fg} ${w.gasPrice}\n` +
      `{${C.orange}-fg}Nonce:{/${C.orange}-fg} ${w.nonce}`;
    this.walletBox.setContent(content);
    this.render();
  }

  updateToken(obj = {}) {
    const t0 = this.tokens[0] || { enabled: true, name: '-', symbol: '-', balance: '-' };
    this.tokens[0] = { ...t0, enabled: true, ...pick(obj, ['name', 'symbol', 'balance']) };
    this._drawTokensGrid();
    this.render();
  }

  setTokens(tokensArray = []) {
    const arr = Array.from({ length: 10 }).map((_, i) => {
      const src = tokensArray[i] || {};
      return {
        enabled: !!src.enabled,
        name: src.name || '-',
        symbol: src.symbol || '-',
        balance: src.balance ?? '-'
      };
    });
    this.tokens = arr;
    this._drawTokensGrid();
    this.render();
  }

  enableToken(index, enabled) {
    if (index < 0 || index > 9) return;
    this.tokens[index] = this.tokens[index] || { enabled: false, name: '-', symbol: '-', balance: '-' };
    this.tokens[index].enabled = !!enabled;
    this._drawTokensGrid();
    this.render();
  }

  updateTokenAt(index, partial = {}) {
    if (index < 0 || index > 9) return;
    const cur = this.tokens[index] || { enabled: false, name: '-', symbol: '-', balance: '-' };
    this.tokens[index] = { ...cur, ...partial };
    this._drawTokensGrid();
    this.render();
  }

  updateStats(partial = {}) {
    if ('transactionCount' in partial) this.transactionCount = partial.transactionCount;
    if ('successRate'      in partial) this.successRate      = partial.successRate;
    if ('failedTx'         in partial) this.failedTx         = partial.failedTx;
    if ('pendingTx'        in partial) this.pendingTx        = partial.pendingTx;
    if ('currentGasPrice'  in partial) this.currentGasPrice  = partial.currentGasPrice;
    this._drawStats();
    this._drawActivity();
    this._drawStatus();
    this.render();
  }

  clearLogs() { this.logsBox.setContent(''); this.render(); }

  log(type = 'info', message = '', delay = 0) {
    const C = this.opts.colors;
    const LOGS = {
      success:  { symbol: '[SUCCESS]',  color: C.success },
      error:    { symbol: '[ERROR]',    color: C.error },
      warning:  { symbol: '[WARNING]',  color: C.warning },
      info:     { symbol: '[INFO]',     color: C.info },
      pending:  { symbol: '[PENDING]',  color: C.secondary },
      completed:{ symbol: '[DONE]',     color: C.success },
      failed:   { symbol: '[FAILED]',   color: C.error },
      swap:     { symbol: '[SWAP]',     color: C.cyan },
      liquidity:{ symbol: '[LIQUID]',   color: C.purple },
      bridge:   { symbol: '[BRIDGE]',   color: C.orange },
      stake:    { symbol: '[STAKE]',    color: C.pink },
      gas:      { symbol: '[GAS]',      color: C.warning }
    };
    const cfg = LOGS[type] || LOGS.info;
    const ts = moment().format('HH:mm:ss');
    setTimeout(() => {
      this.logsBox.log(`{grey-fg}[${ts}]{/grey-fg} {${cfg.color}-fg}${cfg.symbol}{/${cfg.color}-fg} {${cfg.color}-fg}${message}{/${cfg.color}-fg}`);
      this.render();
    }, delay);
  }

  _wireKeys() {
    this.screen.key(['s', 'S'], () => {
      this.setActive(!this.isActive);
      this.log(this.isActive ? 'success' : 'warning', this.isActive ? 'ACTIVE' : 'IDLE', 0);
    });
    this.screen.key(['r', 'R'], () => { this._refreshAll(); this.render(); this.log('info','Redraw UI',0); });
    this.screen.key(['c', 'C'], () => { this.clearLogs(); this.log('info','Logs cleared',0); });
  }

  _setBannerFrame(text, font, colorHex) {
    this.banner.setContent(
      `{${colorHex}-fg}` +
      figlet.textSync(text, { font: font || 'ANSI Shadow', horizontalLayout: 'default', verticalLayout: 'default' }) +
      `{/${colorHex}-fg}`
    );
  }

  _animateBanner() {
    const colors = [this.opts.colors.primary, this.opts.colors.cyan, this.opts.colors.purple, this.opts.colors.secondary, this.opts.colors.orange, this.opts.colors.pink];
    let idx = 0;
    this._every(5000, () => {
      const col = colors[Math.floor(Math.random() * colors.length)];
      const text = this.bannerTexts[idx];
      this._setBannerFrame(text, this.bannerFont, col);
      idx = (idx + 1) % this.bannerTexts.length;
      this.render();
    });
  }

  _drawStats() {
    const C = this.opts.colors;
    const content =
      `{${C.success}-fg}Total Transactions:{/${C.success}-fg} ${this.transactionCount}\n` +
      `{${C.info}-fg}Success Rate:{/${C.info}-fg} ${Number(this.successRate || 0).toFixed(1)}%\n` +
      `{${C.error}-fg}Failed:{/${C.error}-fg} ${this.failedTx}\n` +
      `{${C.secondary}-fg}Pending:{/${C.secondary}-fg} ${this.pendingTx}\n` +
      `{${C.cyan}-fg}Avg Gas:{/${C.cyan}-fg} ${this.currentGasPrice || 0} Gwei`;
    this.statsBox.setContent(content);
  }

  _drawActivity() {
    const C = this.opts.colors;
    const lines = [];
    if (this.isActive) {
      lines.push(`{${C.success}-fg}[RUNNING] Active{/${C.success}-fg}`);
      lines.push(`{${C.cyan}-fg}[MONITOR] External Strategy{/${C.cyan}-fg}`);
    } else {
      lines.push(`{${C.warning}-fg}[IDLE] Waiting commands{/${C.warning}-fg}`);
    }
    if (this.pendingTx > 0) {
      lines.push(`{${C.secondary}-fg}[PENDING] ${this.pendingTx} Tx Processing{/${C.secondary}-fg}`);
    }
    this.activityBox.setContent(lines.join('\n'));
  }

  _drawStatus() {
    const C = this.opts.colors;
    const now = moment();
    const statusColor = this.isActive ? C.success : C.warning;
    const statusTextStr = this.isActive ? 'ACTIVE' : 'IDLE';
    const content =
      `{bold}Status:{/bold} {${statusColor}-fg}${statusTextStr}{/${statusColor}-fg}  ` +
      `{bold}Time:{/bold} {${C.cyan}-fg}${now.format('HH:mm:ss')}{/${C.cyan}-fg}  ` +
      `{bold}Date:{/bold} {${C.info}-fg}${now.format('DD/MM/YYYY')}{/${C.info}-fg}  ` +
      `{bold}Tx:{/bold} {${C.success}-fg}${this.transactionCount}{/${C.success}-fg}  ` +
      `{bold}Gas:{/bold} {${C.purple}-fg}${this.currentGasPrice || 0} Gwei{/${C.purple}-fg}`;
    this.statusText.setContent(content);
  }

  _drawTokensGrid() {
    const C = this.opts.colors;
    const enabled = this.tokens.filter(t => t && t.enabled);
    if (enabled.length === 0) {
      this.tokenBox.setContent(`{${C.info}-fg}No tokens enabled{/${C.info}-fg}`);
      return;
    }

    const tokenColors = [
      C.cyan, C.purple, C.orange, C.pink, C.secondary,
      C.success, C.error, C.info, C.warning, C.primary
    ];

    const cols = Math.max(1, Math.min(4, this.opts.tokenColumns || 2));

    const items = enabled.map((t, i) => {
      const col = tokenColors[i % tokenColors.length];
      const label = `{${col}-fg}${t.name || '-'} (${t.symbol || '-'}){/${col}-fg}`;
      const bal = `{${col}-fg}${String(t.balance ?? '0')}{/${col}-fg}`;
      return `${label}: ${bal}`;
    });

    const stripTags = (s) => s.replace(/\{\/?[#a-z0-9]+\-[a-z]+\}/gi, '');
    const maxPlainLen = Math.max(...items.map(s => stripTags(s).length));
    const colWidth = Math.min(Math.max(maxPlainLen + 2, 22), 36);

    const rows = [];
    for (let i = 0; i < items.length; i += cols) {
      const slice = items.slice(i, i + cols);
      const line = slice
        .map(s => {
          const plainLen = stripTags(s).length;
          const padLen = Math.max(colWidth - plainLen, 0);
          return s + ' '.repeat(padLen);
        })
        .join(' ');
      rows.push(line);
    }

    this.tokenBox.setContent(rows.join('\n'));
  }

  _refreshAll() {
    this.updateWallet({});
    this._drawTokensGrid();
    this._drawStats();
    this._drawActivity();
    this._drawStatus();
  }

  _welcomeLogs() {
    this.log('info', '================================', 0);
    this.log('success', `${this.opts.title}`, 100);
    this.log('info', 'Controlled Mode + Animated Banner + Token Grid', 200);
    this.log('info', 'Press [R] redraw, [C] clear, [Q/ESC] exit', 300);
    this.log('info', '================================', 400);
  }

  _every(ms, fn) {
    const id = setInterval(fn, ms);
    this._intervals.add(id);
    return id;
  }
}

function pick(obj, keys) {
  const out = {};
  keys.forEach(k => { if (k in obj) out[k] = obj[k]; });
  return out;
}

module.exports = { CryptoBotUI };
