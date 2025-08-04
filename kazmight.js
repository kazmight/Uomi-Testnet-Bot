// uomi-script.js

require('dotenv').config();
const { ethers } = require('ethers');
const readline = require('readline');
const util = require('util');

// --- Configurations and Logger ---

const colors = {
  reset: "\x1b[0m", cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", white: "\x1b[37m", bold: "\x1b[1m", blue: "\x1b[34m",
};

const showTimestamp = () => {
  const now = new Date();
  const date = now.toLocaleDateString('id-ID');
  const time = now.toLocaleTimeString('id-ID');
  return `${date} ${time}`;
};

const logger = {
  info: (msg) => console.log(`${colors.green}${colors.bold}[✅]${colors.reset} [${showTimestamp()}] ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}${colors.bold}[🛑]${colors.reset} [${showTimestamp()}] ${msg}`),
  error: (msg) => console.log(`${colors.red}${colors.bold}[❌]${colors.reset} [${showTimestamp()}] ${msg}`),
  success: (msg) => console.log(`${colors.green}${colors.bold}[✅]${colors.reset} [${showTimestamp()}] ${msg}`),
  loading: (msg) => console.log(`${colors.cyan}${colors.bold}[🔄]${colors.reset} [${showTimestamp()}] ${msg}`),
  step: (msg) => console.log(`${colors.white}${colors.bold}[🟢]${colors.reset} [${showTimestamp()}] ${msg}`),
  countdown: (msg) => process.stdout.write(`\r${colors.blue}${colors.bold}[⏰]${colors.reset} [${showTimestamp()}] ${msg}`),
};

const showBanner = () => {
  const banner = `
${colors.cyan}
  ___  ___  _ _ _  _  _  ___
 / _ \\/ _ \\| | | || || |/ _ \\
| (_) | (_) | | | || || | (_) |
 \\___/\\___/|_|_|\\_\\_\\_|\\___/

${colors.reset}${colors.white}UOMI Trading Automation Script${colors.reset}
  `;
  console.log(banner);
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = util.promisify(rl.question).bind(rl);

const sleep = async (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const delayWithCountdown = async (seconds) => {
  for (let i = seconds; i > 0; i--) {
    logger.countdown(`Jeda sebelum transaksi berikutnya: ${i} detik...`);
    await sleep(1000);
  }
  process.stdout.write('\n');
};

const RPC_URL = "https://finney.uomi.ai";

// Read private keys from .env file using indexed keys
let privateKeys = [];
let i = 1;
while (process.env[`PRIVATE_KEYS_${i}`]) {
  privateKeys.push(process.env[`PRIVATE_KEYS_${i}`]);
  i++;
}

if (privateKeys.length === 0) {
  logger.error("No private keys found in environment variables. Please configure the .env file with PRIVATE_KEYS_1, PRIVATE_KEYS_2, etc.");
  process.exit(1);
}

// Token contract addresses
// UOMI is the native token, so it does not have a contract address.
// The "0x00..." address is used as a placeholder.
const TOKENS = {
  "UOMI": {
    isNative: true,
    symbol: "UOMI",
    decimals: 18,
    address: ethers.ZeroAddress
  },
  "SYN": {
    isNative: false,
    symbol: "SYN",
    address: "0x2922B2Ca5EB6b02fc5E1EBE57Fc1972eBB99F7e0",
    decimals: 18
  },
  "SIM": {
    isNative: false,
    symbol: "SIM",
    address: "0x04B03e3859A25040E373cC9E8806d79596D70686",
    decimals: 18
  },
  "USDC": {
    isNative: false,
    symbol: "USDC",
    address: "0xAA9C4829415BCe70c434b7349b628017C59EC2b1",
    decimals: 18
  },
  "WRAPPED_UOMI": {
    isNative: false,
    symbol: "WUOMI",
    address: "0x5FCa78E132dF589c1c799F906dC867124a2567b2",
    decimals: 18
  },
};

const SWAP_CONTRACT_ADDRESS = "0x197EEAd5Fe3DB82c4Cd55C5752Bc87AEdE11f230";
const LIQUIDITY_CONTRACT_ADDRESS = "0x906515Dc7c32ab887C8B8Dce6463ac3a7816Af38";

// --- Optimized ABIs ---
// ABI for the swap contract, only including the relevant `execute` function.
const SWAP_ABI = [{"inputs":[{"internalType":"bytes","name":"commands","type":"bytes"},{"internalType":"bytes[]","name":"inputs","type":"bytes[]"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"execute","outputs":[],"stateMutability":"payable","type":"function"}];
// ABI for the add liquidity contract, only including the relevant `mint` function.
const LIQUIDITY_ABI = [{"inputs":[{"components":[{"internalType":"address","name":"token0","type":"address"},{"internalType":"address","name":"token1","type":"address"},{"internalType":"uint24","name":"fee","type":"uint24"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint256","name":"amount0Desired","type":"uint256"},{"internalType":"uint256","name":"amount1Desired","type":"uint256"},{"internalType":"uint256","name":"amount0Min","type":"uint256"},{"internalType":"uint256","name":"amount1Min","type":"uint256"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"internalType":"struct INonfungiblePositionManager.MintParams","name":"params","type":"tuple"}],"name":"mint","outputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"uint128","name":"liquidity","type":"uint128"},{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"payable","type":"function"}];
// ABI for ERC20 token approval.
const ERC20_ABI_APPROVE = [{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"type":"function"}];
// ABI for getting ERC20 token balance.
const ERC20_ABI_BALANCE = [{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}];


// Initialize Provider
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Create wallet instances for each private key
const wallets = privateKeys.map(key => new ethers.Wallet(key, provider));

// --- Helper Functions ---
const getERC20Contract = (tokenAddress, wallet) => {
  return new ethers.Contract(tokenAddress, ERC20_ABI_APPROVE, wallet);
};

const getTokenBalance = async (token, walletAddress) => {
    if (token.isNative) {
        return await provider.getBalance(walletAddress);
    } else {
        const contract = new ethers.Contract(token.address, ERC20_ABI_BALANCE, provider);
        return await contract.balanceOf(walletAddress);
    }
};

const approveToken = async (token, spenderAddress, amount, wallet) => {
  if (token.isNative) return;

  logger.step(`[${wallet.address}] Memeriksa persetujuan untuk ${token.symbol}...`);
  const tokenContract = getERC20Contract(token.address, wallet);
  const allowance = await tokenContract.allowance(wallet.address, spenderAddress);

  if (allowance < amount) {
    logger.loading(`[${wallet.address}] Menyetujui ${ethers.formatUnits(amount, token.decimals)} ${token.symbol} untuk spender ${spenderAddress}...`);
    try {
      const tx = await tokenContract.approve(spenderAddress, amount);
      await tx.wait();
      logger.success(`[${wallet.address}] Transaksi persetujuan berhasil: ${tx.hash}`);
    } catch (error) {
      logger.error(`[${wallet.address}] Gagal melakukan persetujuan:`, error);
      throw error;
    }
  } else {
    logger.info(`[${wallet.address}] Persetujuan sudah cukup.`);
  }
};

const buildSwapCommands = (path, amountIn, amountOutMin) => {
  logger.warn("Peringatan: Fungsi `buildSwapCommands` adalah placeholder.");
  logger.warn("Anda perlu mengimplementasikan logika encoding yang benar sesuai kontrak.");

  const commands = ethers.hexlify([0x00]);
  const inputs = [
    ethers.AbiCoder.defaultAbiCoder().encode(['address[]', 'uint256', 'uint256'], [path, amountIn, amountOutMin])
  ];
  
  return { commands, inputs };
};

// --- Main Transaction Functions ---
async function performSwap(tokenIn, tokenOut, amountInWei, wallet) {
  logger.info(`[${wallet.address}] Memulai Swap: ${tokenIn.symbol} -> ${tokenOut.symbol} ...`);
  
  try {
    if (!tokenIn.isNative) {
      await approveToken(tokenIn, SWAP_CONTRACT_ADDRESS, amountInWei, wallet);
    }
    
    const deadline = Math.floor(Date.now() / 1000) + 60 * 5;
    const path = [tokenIn.address, tokenOut.address];
    const amountOutMin = 0;
    
    const { commands, inputs } = buildSwapCommands(path, amountInWei, amountOutMin);
    
    const txOptions = {
      gasLimit: 500000,
    };

    if (tokenIn.isNative) {
      txOptions.value = amountInWei;
    }
    
    // Create a new contract instance with the specific wallet for this transaction
    const specificWalletSwapContract = swapContract.connect(wallet);

    logger.loading(`[${wallet.address}] Mengirim transaksi swap...`);
    const tx = await specificWalletSwapContract.execute(commands, inputs, deadline, txOptions);
    logger.success(`[${wallet.address}] Transaksi swap terkirim!`);
    
    await tx.wait();
    logger.success(`[${wallet.address}] Transaksi swap berhasil dikonfirmasi!`);
    logger.info(`Lihat di Explorer: https://explorer.uomi.ai/tx/${tx.hash}`);
  } catch (error) {
    logger.error(`[${wallet.address}] Gagal melakukan swap:`, error);
  }
}

async function performAddLiquidity(token0, token1, amount0Wei, amount1Wei, wallet) {
  logger.info(`[${wallet.address}] Memulai Tambah Likuiditas: ${token0.symbol} & ${token1.symbol} ...`);
  
  try {
    await approveToken(token0, LIQUIDITY_CONTRACT_ADDRESS, amount0Wei, wallet);
    await approveToken(token1, LIQUIDITY_CONTRACT_ADDRESS, amount1Wei, wallet);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 5;
    const recipient = wallet.address;
    const fee = 3000;
    const tickLower = -887272;
    const tickUpper = 887272;
    const amount0Min = (amount0Wei * 99n) / 100n;
    const amount1Min = (amount1Wei * 99n) / 100n;

    const mintParams = {
      token0: token0.address,
      token1: token1.address,
      fee: fee,
      tickLower: tickLower,
      tickUpper: tickUpper,
      amount0Desired: amount0Wei,
      amount1Desired: amount1Wei,
      amount0Min: amount0Min,
      amount1Min: amount1Min,
      recipient: recipient,
      deadline: deadline,
    };
    
    const specificWalletLiquidityContract = liquidityContract.connect(wallet);

    logger.loading(`[${wallet.address}] Mengirim transaksi tambah likuiditas...`);
    const tx = await specificWalletLiquidityContract.mint(mintParams, {
      gasLimit: 1000000
    });
    
    logger.success(`[${wallet.address}] Transaksi tambah likuiditas terkirim!`);
    await tx.wait();
    logger.success(`[${wallet.address}] Transaksi tambah likuiditas berhasil dikonfirmasi!`);
    logger.info(`Lihat di Explorer: https://explorer.uomi.ai/tx/${tx.hash}`);
  } catch (error) {
    logger.error(`[${wallet.address}] Gagal menambahkan likuiditas:`, error);
  }
}

// --- Interactive CLI Logic ---
async function runInteractiveMode() {
  showBanner();

  const accountsWithBalances = await Promise.all(wallets.map(async (wallet) => {
    const address = await wallet.getAddress();
    const tokensWithBalances = await Promise.all(Object.keys(TOKENS).map(async (key) => {
      const token = TOKENS[key];
      const balance = await getTokenBalance(token, address);
      return { ...token, balance: balance };
    }));
    return { address, balances: tokensWithBalances };
  }));

  logger.step("Memuat saldo token untuk semua akun...");
  accountsWithBalances.forEach(account => {
    logger.info(`Alamat dompet: ${account.address}`);
    account.balances.forEach(t => {
      if (t.balance > 0) {
        logger.info(`  Saldo ${t.symbol}: ${ethers.formatUnits(t.balance, t.decimals)}`);
      }
    });
  });
  console.log("");

  const selectedMode = await question("Pilih mode (1: Swap, 2: Add Liquidity): ");
  let selectedWallets;

  const runAllAccounts = await question("Jalankan untuk semua akun? (y/n): ");
  if (runAllAccounts.toLowerCase() === 'y') {
    selectedWallets = wallets;
  } else {
    const accountIndex = parseInt(await question(`Pilih akun (1-${wallets.length}): `)) - 1;
    if (isNaN(accountIndex) || accountIndex < 0 || accountIndex >= wallets.length) {
      logger.error("Pilihan akun tidak valid.");
      rl.close();
      return;
    }
    selectedWallets = [wallets[accountIndex]];
  }

  for (const wallet of selectedWallets) {
    if (selectedMode === '1') {
      logger.step("Mode: SWAP");
      const tokenInSymbol = await question(`Pilih token masuk (${Object.keys(TOKENS).join(', ')}): `);
      const tokenOutSymbol = await question(`Pilih token keluar (${Object.keys(TOKENS).join(', ')}): `);
      const percentage = parseFloat(await question(`Masukkan persentase jumlah untuk di swap (e.g., 50 untuk 50%): `));

      if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
        logger.error("Persentase tidak valid.");
        continue;
      }

      const tokenIn = TOKENS[tokenInSymbol.toUpperCase()];
      const tokenOut = TOKENS[tokenOutSymbol.toUpperCase()];
      
      if (!tokenIn || !tokenOut) {
        logger.error("Pilihan token tidak valid.");
        continue;
      }
      
      const tokenInBalance = await getTokenBalance(tokenIn, wallet.address);
      const amountInWei = (tokenInBalance * BigInt(Math.round(percentage * 100))) / BigInt(10000);
      
      logger.info(`[${wallet.address}] Anda akan menukar ${ethers.formatUnits(amountInWei, tokenIn.decimals)} ${tokenIn.symbol}.`);
      
      const delaySeconds = parseInt(await question(`Masukkan delay manual untuk transaksi ini dalam detik (misal: 10): `));
      await delayWithCountdown(delaySeconds);

      await performSwap(tokenIn, tokenOut, amountInWei, wallet);

    } else if (selectedMode === '2') {
      logger.step("Mode: ADD LIQUIDITY");
      const token0Symbol = await question(`Pilih token pertama (${Object.keys(TOKENS).join(', ')}): `);
      const token1Symbol = await question(`Pilih token kedua (${Object.keys(TOKENS).join(', ')}): `);
      const percentage0 = parseFloat(await question(`Masukkan persentase jumlah ${token0Symbol} untuk ditambahkan (e.g., 50): `));
      const percentage1 = parseFloat(await question(`Masukkan persentase jumlah ${token1Symbol} untuk ditambahkan (e.g., 50): `));

      if (isNaN(percentage0) || percentage0 <= 0 || percentage0 > 100 || isNaN(percentage1) || percentage1 <= 0 || percentage1 > 100) {
        logger.error("Persentase tidak valid.");
        continue;
      }

      const token0 = TOKENS[token0Symbol.toUpperCase()];
      const token1 = TOKENS[token1Symbol.toUpperCase()];

      if (!token0 || !token1) {
        logger.error("Pilihan token tidak valid.");
        continue;
      }

      const token0Balance = await getTokenBalance(token0, wallet.address);
      const token1Balance = await getTokenBalance(token1, wallet.address);
      
      const amount0Wei = (token0Balance * BigInt(Math.round(percentage0 * 100))) / BigInt(10000);
      const amount1Wei = (token1Balance * BigInt(Math.round(percentage1 * 100))) / BigInt(10000);
      
      logger.info(`[${wallet.address}] Anda akan menambahkan ${ethers.formatUnits(amount0Wei, token0.decimals)} ${token0.symbol} dan ${ethers.formatUnits(amount1Wei, token1.decimals)} ${token1.symbol}.`);
      
      const delaySeconds = parseInt(await question(`Masukkan delay manual untuk transaksi ini dalam detik (misal: 10): `));
      await delayWithCountdown(delaySeconds);

      await performAddLiquidity(token0, token1, amount0Wei, amount1Wei, wallet);
    } else {
      logger.error("Pilihan mode tidak valid.");
    }
  }

  rl.close();
}

runInteractiveMode().catch(console.error);
