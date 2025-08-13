## UOMI Testnet Automation Bot

**Node.js + Ethers.js v5**-based terminal bot with an **interactive UI**
It simplifies automated transaction execution on the **UOMI Testnet**, including:

- Wrapping / Unwrapping UOMI ↔ WUOMI
- Random token swaps (WUOMI → USDC / SYN / SIM)
- Random liquidity provision (full-range)
- Real-time wallet info, gas prices, and token balances
- Automatic transaction logging to file


## 📦 Key Features

- **Terminal UI** with banner, menu, status bar, and colored logs.
- **Scrolling ticker text** for announcements or promotional messages.
- **Automatic transaction logging** to a file (default: `transactions.log`).
- **Real-time balance updates** every 5 seconds.
- **Randomized actions** for testnet experimentation.
- **Improved Add LP logic**:
  - Automatically sorts token0/token1 according to Uniswap V3 rules.
  - Sets `amount0Min` & `amount1Min` to 0 to avoid mint failures due to slippage.
  - Special handling for native WUOMI pairs.


## Full Tutorial Join Telegram Channel : https://t.me/invictuslabs

<img width="1488" height="803" alt="Screenshot (219)" src="https://github.com/user-attachments/assets/56a951ee-6e44-461b-a164-7c2ffb313d50" />
